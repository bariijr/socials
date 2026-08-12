"""Load ANS provider data from various sources."""

import logging
import json
from typing import Dict
from app.core.config import settings
from app.core.fees import ANSProvider, get_default_providers

logger = logging.getLogger(__name__)


def load_ans_providers() -> Dict[str, ANSProvider]:
    """
    Load ANS provider catalog from configured data source.
    
    Priority:
    1. Database (if configured)
    2. Excel file (EXCEL_DATA_PATH)
    3. JSON file
    4. Built-in defaults
    """
    
    # Try Excel first
    if settings.EXCEL_DATA_PATH:
        try:
            return load_from_excel(settings.EXCEL_DATA_PATH)
        except Exception as e:
            logger.warning(f"Failed to load providers from Excel: {str(e)}")
    
    # Try JSON
    try:
        return load_from_json("./data/ans_providers.json")
    except Exception as e:
        logger.warning(f"Failed to load providers from JSON: {str(e)}")
    
    # Fall back to defaults
    logger.info("Using built-in default ANS providers")
    return get_default_providers()


def load_from_excel(excel_path: str) -> Dict[str, ANSProvider]:
    """
    Load ANS provider data from Excel file.
    
    Expected sheet structure:
    - Sheet: "Providers"
    - Columns: icao_code, name, country, fee_formula, base_rate, min_fee, max_fee, notes
    """
    try:
        import openpyxl
        
        providers = {}
        workbook = openpyxl.load_workbook(excel_path)
        sheet = workbook["Providers"]
        
        # Skip header
        for row in list(sheet.iter_rows(min_row=2, values_only=False)):
            icao_code = row[0].value
            name = row[1].value
            country = row[2].value
            fee_formula = row[3].value  # "mtow_distance", "distance_only", etc.
            base_rate = row[4].value
            min_fee = row[5].value or 0.0
            max_fee = row[6].value
            
            if not icao_code or not name:
                continue
            
            # Create provider from Excel data
            from app.core.fees import FeeComponent, FeeFormulaType
            
            formula_type = FeeFormulaType[fee_formula.upper()] if fee_formula else FeeFormulaType.MTOW_DISTANCE
            
            provider = ANSProvider(
                icao_code=icao_code.upper(),
                name=name,
                country=country,
                firs_managed=[icao_code.upper()],
                fee_components=[
                    FeeComponent(
                        name="En-route",
                        formula_type=formula_type,
                        base_rate=float(base_rate),
                        minimum_fee=float(min_fee),
                        maximum_fee=float(max_fee) if max_fee else None,
                    )
                ],
            )
            
            providers[icao_code.upper()] = provider
        
        logger.info(f"Loaded {len(providers)} providers from Excel: {excel_path}")
        return providers
    
    except ImportError:
        logger.error("openpyxl not installed; cannot load Excel data")
        raise
    except Exception as e:
        logger.error(f"Error loading Excel: {str(e)}")
        raise


def load_from_json(json_path: str) -> Dict[str, ANSProvider]:
    """
    Load ANS provider data from JSON file.
    
    Expected JSON structure:
    {
        "PROVIDERS": [
            {
                "icao_code": "FLLX",
                "name": "Lilongwe",
                "country": "Malawi",
                "fee_formula": "mtow_distance",
                "base_rate": 2.0,
                ...
            }
        ]
    }
    """
    try:
        with open(json_path, "r") as f:
            data = json.load(f)
        
        providers = {}
        from app.core.fees import FeeComponent, FeeFormulaType
        
        for provider_data in data.get("PROVIDERS", []):
            icao_code = provider_data["icao_code"].upper()
            
            formula_type_str = provider_data.get("fee_formula", "MTOW_DISTANCE").upper()
            try:
                formula_type = FeeFormulaType[formula_type_str]
            except KeyError:
                formula_type = FeeFormulaType.MTOW_DISTANCE
            
            provider = ANSProvider(
                icao_code=icao_code,
                name=provider_data.get("name", icao_code),
                country=provider_data.get("country", ""),
                firs_managed=[icao_code],
                fee_components=[
                    FeeComponent(
                        name="En-route",
                        formula_type=formula_type,
                        base_rate=float(provider_data.get("base_rate", 1.0)),
                        minimum_fee=float(provider_data.get("minimum_fee", 0.0)),
                        maximum_fee=float(provider_data.get("maximum_fee")) if provider_data.get("maximum_fee") else None,
                    )
                ],
                vat_rate=float(provider_data.get("vat_rate", 0.0)),
                applies_50km_deduction=provider_data.get("applies_50km_deduction", False),
            )
            
            providers[icao_code] = provider
        
        logger.info(f"Loaded {len(providers)} providers from JSON: {json_path}")
        return providers
    
    except FileNotFoundError:
        logger.warning(f"JSON file not found: {json_path}")
        raise
    except Exception as e:
        logger.error(f"Error loading JSON: {str(e)}")
        raise


def load_from_database(db_session) -> Dict[str, ANSProvider]:
    """Load ANS providers from database."""
    try:
        from app.db.models import ANSProviderModel
        from app.core.fees import FeeComponent, FeeFormulaType
        
        providers = {}
        
        for provider_record in db_session.query(ANSProviderModel).all():
            fee_component = FeeComponent(
                name="En-route",
                formula_type=FeeFormulaType[provider_record.fee_formula_type.upper()],
                base_rate=provider_record.base_unit_rate,
                minimum_fee=0.0,
            )
            
            provider = ANSProvider(
                icao_code=provider_record.icao_code,
                name=provider_record.name,
                country=provider_record.country,
                firs_managed=provider_record.managed_firs or [provider_record.icao_code],
                fee_components=[fee_component],
                vat_rate=provider_record.vat_rate,
                applies_50km_deduction=provider_record.applies_50km_deduction,
            )
            
            providers[provider_record.icao_code] = provider
        
        logger.info(f"Loaded {len(providers)} providers from database")
        return providers
    
    except Exception as e:
        logger.error(f"Error loading from database: {str(e)}")
        return {}
