"""Invoice archive: a PDF per invoice, filed under a company.

Fully self-contained — invoice amounts and their VAT are never rolled into
expenses, payroll or the dashboard.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.activity_log import log_activity
from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Company, Invoice, User
from app.schemas.common import Page
from app.schemas.invoice import (
    InvoiceCompanySummary,
    InvoiceOut,
    InvoiceTotals,
    InvoiceUpdate,
)
from app.storage import StorageError, delete_invoice_pdf, invoice_path, save_invoice_pdf

router = APIRouter(prefix="/invoices", tags=["invoices"], dependencies=[Depends(get_current_user)])


def _money(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _vat(amount: float) -> tuple[float, float, float]:
    """Return (rate, vat_amount, total) — VAT is always applied on invoices."""
    rate = settings.vat_rate
    vat_amount = _money(amount * rate)
    return rate, vat_amount, _money(_money(amount) + vat_amount)


def _to_out(invoice: Invoice) -> InvoiceOut:
    out = InvoiceOut.model_validate(invoice)
    out.company_name = invoice.company.name if invoice.company else None
    return out


def _filtered(
    company_id: int | None, month: int | None, year: int | None, search: str | None
):
    stmt = select(Invoice)
    if company_id:
        stmt = stmt.where(Invoice.company_id == company_id)
    if month:
        stmt = stmt.where(Invoice.month == month)
    if year:
        stmt = stmt.where(Invoice.year == year)
    if search:
        like = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(func.coalesce(Invoice.invoice_number, "")).like(like)
            | func.lower(Invoice.description).like(like)
            | func.lower(Invoice.file_name).like(like)
        )
    return stmt


@router.get("", response_model=Page[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    company_id: int | None = None,
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[InvoiceOut]:
    stmt = _filtered(company_id, month, year, search)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page.create([_to_out(r) for r in rows], total, page, page_size)


@router.get("/totals", response_model=InvoiceTotals)
def totals(
    db: Session = Depends(get_db),
    company_id: int | None = None,
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
    search: str | None = None,
) -> InvoiceTotals:
    sub = _filtered(company_id, month, year, search).subquery()
    return InvoiceTotals(
        invoice_count=db.scalar(select(func.count()).select_from(sub)) or 0,
        total_amount=float(db.scalar(select(func.coalesce(func.sum(sub.c.amount), 0))) or 0),
        total_vat=float(db.scalar(select(func.coalesce(func.sum(sub.c.vat_amount), 0))) or 0),
        grand_total=float(db.scalar(select(func.coalesce(func.sum(sub.c.total), 0))) or 0),
    )


@router.get("/by-company", response_model=list[InvoiceCompanySummary])
def by_company(
    db: Session = Depends(get_db),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = None,
) -> list[InvoiceCompanySummary]:
    stmt = (
        select(
            Company.id,
            Company.name,
            func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.amount), 0),
            func.coalesce(func.sum(Invoice.vat_amount), 0),
            func.coalesce(func.sum(Invoice.total), 0),
        )
        .join(Invoice, Invoice.company_id == Company.id)
        .group_by(Company.id, Company.name)
        .order_by(func.coalesce(func.sum(Invoice.total), 0).desc())
    )
    if month:
        stmt = stmt.where(Invoice.month == month)
    if year:
        stmt = stmt.where(Invoice.year == year)
    return [
        InvoiceCompanySummary(
            company_id=r[0], company_name=r[1], invoice_count=r[2],
            total_amount=float(r[3]), total_vat=float(r[4]), grand_total=float(r[5]),
        )
        for r in db.execute(stmt).all()
    ]


@router.get("/years", response_model=list[int])
def years(db: Session = Depends(get_db)) -> list[int]:
    rows = db.execute(select(Invoice.year).group_by(Invoice.year).order_by(Invoice.year.desc())).all()
    return [r[0] for r in rows]


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def upload_invoice(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    company_id: int = Form(...),
    amount: float = Form(..., gt=0),
    invoice_date: date = Form(...),
    invoice_number: str = Form(""),
    description: str = Form(""),
    file: UploadFile = File(...),
) -> InvoiceOut:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    try:
        stored = save_invoice_pdf(file)
    except StorageError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    rate, vat_amount, total = _vat(amount)
    invoice = Invoice(
        company_id=company_id,
        invoice_number=invoice_number.strip() or None,
        description=description.strip(),
        amount=_money(amount),
        vat_rate=rate,
        vat_amount=vat_amount,
        total=total,
        invoice_date=invoice_date,
        month=invoice_date.month,
        year=invoice_date.year,
        file_name=(file.filename or "invoice.pdf")[:255],
        stored_name=stored.stored_name,
        file_size=stored.size,
        checksum=stored.checksum,
        uploaded_by=user.id,
    )
    try:
        db.add(invoice)
        db.flush()
        log_activity(db, user=user, action="uploaded", entity="invoice", entity_id=invoice.id,
                     description=f"{company.name}: invoice SAR {total:.2f}")
        db.commit()
    except Exception:
        db.rollback()
        delete_invoice_pdf(stored.stored_name)  # never leave an orphan file behind
        raise
    db.refresh(invoice)
    return _to_out(invoice)


@router.get("/{invoice_id}/file")
def download_invoice(
    invoice_id: int, db: Session = Depends(get_db), download: bool = False
) -> FileResponse:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    path = invoice_path(invoice.stored_name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The stored PDF is missing")
    disposition = "attachment" if download else "inline"
    name = quote(invoice.file_name)
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={"Content-Disposition": f"{disposition}; filename*=UTF-8''{name}"},
    )


@router.patch("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: int, payload: InvoiceUpdate, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InvoiceOut:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    data = payload.model_dump(exclude_unset=True)
    if "company_id" in data and not db.get(Company, data["company_id"]):
        raise HTTPException(status_code=404, detail="Company not found")
    if "invoice_number" in data and isinstance(data["invoice_number"], str):
        data["invoice_number"] = data["invoice_number"].strip() or None
    for k, v in data.items():
        setattr(invoice, k, v)
    if "invoice_date" in data:
        invoice.month = invoice.invoice_date.month
        invoice.year = invoice.invoice_date.year
    if "amount" in data:
        invoice.vat_rate, invoice.vat_amount, invoice.total = _vat(float(invoice.amount))
        invoice.amount = _money(float(invoice.amount))
    log_activity(db, user=user, action="updated", entity="invoice", entity_id=invoice.id,
                 description=f"Updated invoice #{invoice.id}")
    db.commit()
    db.refresh(invoice)
    return _to_out(invoice)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    stored_name = invoice.stored_name
    log_activity(db, user=user, action="deleted", entity="invoice", entity_id=invoice_id,
                 description=f"Deleted invoice #{invoice_id} ({invoice.file_name})")
    db.delete(invoice)
    db.commit()
    delete_invoice_pdf(stored_name)  # DB is the source of truth; file follows
