from pydantic import BaseModel


class ThemeSettingsResponse(BaseModel):
    primary_color: str
    accent_color: str
    background_color: str
    dark_mode: bool


class ThemeSettingsUpdate(ThemeSettingsResponse):
    pass
