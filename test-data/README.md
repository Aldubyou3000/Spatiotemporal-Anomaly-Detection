# Test Data

CSV files for feeding the zone pipeline at `POST /api/zones/process`.

---

## Files

### `sample_rainfall.csv` — 4 320 rows (hourly)
6 stations × 30 days × 24 hours. Tests the full hourly → daily downmap path in Zone A.

| Station | Coordinates | Injected anomaly |
|---------|-------------|-----------------|
| QC-001 | Davao City | Extreme spike on day 8 (hours 10–16) |
| QC-002 | Zamboanga | Normal |
| QC-003 | Cagayan de Oro | Normal |
| QC-004 | Dumaguete | Extreme spike on day 22 (hours 10–16) |
| QC-005 | Cebu City | Normal |
| QC-006 | Butuan | Normal |

~2% of rows have blank rainfall values — Zone A interpolation fills single-hour gaps.  
**Expected result**: QC-001 and QC-004 flagged as anomalous by Zone C.

---

### `sample_rainfall_daily.csv` — 225 rows (daily)
5 stations × 45 days. Pre-aggregated daily totals — Zone A skips downmapping.

| Station | Coordinates | Injected spike days (150–250 mm) |
|---------|-------------|----------------------------------|
| QC-001 | Davao City | None (0.5–6 mm baseline) |
| QC-002 | Zamboanga | None |
| QC-003 | Cagayan de Oro | 15, 16, 30 |
| QC-004 | Dumaguete | None |
| QC-005 | Cebu City | 8, 31, 44 |

**Expected result**: Multiple stations flagged by Zone C LOF (all five may appear depending on contamination setting). QC-003 and QC-005 will always be among them.  
Use this file to test the **Create Ticket** flow — the Anomalies tab will show flagged stations to assign tickets from.

---

## How to use

1. Start the API (`uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`)
2. Log in to the web dashboard at `http://localhost:3000`
3. Go to **Zones** → upload one of these files → click **Analyze**
4. After results load, go to the **Anomalies** tab to confirm flagged stations
5. Use the **Create Ticket** tab to create a maintenance ticket from a flagged station
