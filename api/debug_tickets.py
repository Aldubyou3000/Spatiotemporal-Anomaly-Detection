"""Reproduce the GET /api/tickets database query in isolation."""
import sys, traceback
sys.path.insert(0, ".")

from app.core.dependencies import get_supabase
from app.services.tickets_service import list_tickets, list_technicians, create_ticket
from app.schemas.tickets import TicketCreate

sb = get_supabase()

print("\n[1] list_tickets() — empty state")
try:
    res = list_tickets(sb)
    print(f"    OK: items={len(res['items'])} total={res['total']}")
except Exception:
    print("    EXCEPTION:")
    traceback.print_exc()

print("\n[2] list_technicians()")
try:
    techs = list_technicians(sb)
    print(f"    OK: {len(techs)} technician(s)")
    for t in techs:
        print(f"      - {t.get('username')} ({t.get('id')})")
except Exception:
    print("    EXCEPTION:")
    traceback.print_exc()

print("\n[3] list_tickets(status='assigned')")
try:
    res = list_tickets(sb, status="assigned")
    print(f"    OK: items={len(res['items'])} total={res['total']}")
except Exception:
    print("    EXCEPTION:")
    traceback.print_exc()
