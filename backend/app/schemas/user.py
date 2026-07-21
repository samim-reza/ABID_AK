from pydantic import BaseModel, ConfigDict, Field


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    full_name: str = ""
    is_admin: bool = False
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=4, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: str | None = Field(default=None, min_length=4, max_length=128)
    is_admin: bool | None = None
    is_active: bool | None = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
