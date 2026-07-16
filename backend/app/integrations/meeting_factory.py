"""Factory that resolves a concrete provider from a MeetingProvider row."""

from __future__ import annotations

import json

from app.core.crypto import decrypt
from app.integrations.base_provider import BaseMeetingProvider
from app.integrations.google_provider import GoogleProvider
from app.integrations.manual_provider import ManualProvider
from app.integrations.zoom_provider import ZoomProvider
from app.models import MeetingProvider, ProviderName

_REGISTRY: dict[ProviderName, type[BaseMeetingProvider]] = {
    ProviderName.manual: ManualProvider,
    ProviderName.zoom: ZoomProvider,
    ProviderName.google: GoogleProvider,
    # ProviderName.teams: TeamsProvider,  # TODO: add when implemented
}


def get_provider(provider_row: MeetingProvider) -> BaseMeetingProvider:
    cls = _REGISTRY.get(provider_row.name)
    if cls is None:
        raise ValueError(f"Unsupported provider: {provider_row.name}")

    credentials: dict | None = None
    if provider_row.api_credentials_encrypted:
        credentials = json.loads(decrypt(provider_row.api_credentials_encrypted))

    return cls(credentials=credentials)
