from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    aircraft,
    aircraft_documents,
    airports,
    auth,
    clients,
    confirmation_routing_configs,
    countries,
    country_requirements,
    credentials as credentials_router,
    data_import,
    documents,
    feasibility,
    health,
    message_templates,
    nav_fee_providers,
    notifications,
    operators,
    parties,
    permit_fee_providers,
    persons,
    readiness,
    service_catalogue,
    service_delivery_configs,
    service_messages,
    service_send,
    settings as settings_router,
    trips,
    users,
    vendor_contacts,
    vendors,
    visa_rules,
)
from app.config import get_settings
from app.core import storage
from app.core.exception_handlers import register_exception_handlers
from app.database import AsyncSessionLocal
from app.services import document_template_service, settings_service

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # ensure_seeded is idempotent and additive-only (see
    # app.services.settings_service) — this lets a later phase add a new
    # named setting and have it reach an already-running deployment on
    # next restart, without requiring the importer to be rerun.
    async with AsyncSessionLocal() as session:
        await settings_service.ensure_seeded(session)
        await document_template_service.ensure_seeded(session)
        await session.commit()
    await storage.ensure_bucket_exists()
    yield


app = FastAPI(
    title="Jetelio V3 API",
    description="Flight-support trip and permit planning platform — reference-data API (Phase 1).",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(settings_router.router)
app.include_router(readiness.router)
app.include_router(countries.router)
app.include_router(airports.router)
app.include_router(operators.router)
app.include_router(aircraft.router)
app.include_router(aircraft_documents.router)
app.include_router(clients.router)
app.include_router(vendors.router)
app.include_router(service_catalogue.router)
app.include_router(visa_rules.router)
app.include_router(message_templates.router)
app.include_router(country_requirements.router)
app.include_router(nav_fee_providers.router)
app.include_router(notifications.router)
app.include_router(permit_fee_providers.router)
app.include_router(data_import.router)
app.include_router(feasibility.router)
app.include_router(trips.router)
app.include_router(service_messages.router)
app.include_router(service_send.router)
app.include_router(parties.router)
app.include_router(persons.router)
app.include_router(documents.router)
app.include_router(credentials_router.router)
app.include_router(vendor_contacts.router)
app.include_router(service_delivery_configs.router)
app.include_router(confirmation_routing_configs.router)
