from django.conf import settings

MOCK_REGISTRY = {
    'KMPDC/001/2020': {'name': 'Alice Mwangi',  'specialty': 'General Practice'},
    'KMPDC/002/2019': {'name': 'Brian Otieno',  'specialty': 'Paediatrics'},
    'KMPDC/003/2021': {'name': 'Carol Njoroge', 'specialty': 'Surgery'},
}

def verify_kmpdc_number(kmpdc_number: str) -> dict:

    kmpdc_number = kmpdc_number.strip().upper()
    if kmpdc_number in MOCK_REGISTRY:
        record = MOCK_REGISTRY[kmpdc_number]
        return {'valid': True, 'name': record['name'], 'specialty': record['specialty'], 'message': 'Verified.'}
    if kmpdc_number.startswith('KMPDC/'):
        return {'valid': True, 'name': None, 'specialty': None, 'message': 'Accepted (mock mode).'}
    return {'valid': False, 'name': None, 'specialty': None, 'message': 'Not found in registry.'}
