from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserRead


class Token(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class RefreshRequest(BaseModel):
    refresh_token: str
