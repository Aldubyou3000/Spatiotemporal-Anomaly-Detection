[Analyst creates ticket]
         │
         ▼
     ASSIGNED ──────────────────────────────────────────────────────────────────────┐
  Technician(s) notified                                                            │
  Ticket visible on mobile                                                          │ Analyst can
         │                                                                          │ add/remove
         │ Technician taps "Start Working"                                          │ technicians
         ▼                                                                          │ at any stage
    IN-PROGRESS ◄──────────────────────────────────────────────────────────────────┘
  Work has physically started
  Timer is running on site
         │
         │ Technician submits inspection report
         ▼
  PENDING REVIEW
  Report is waiting for analyst decision
  Analyst sees it in Reports tab
         │
         ├─── Analyst approves
         │         │
         │         ▼
         │      VERIFIED ◄── Terminal. No further changes allowed.
         │
         └─── Analyst requests follow-up
                   │
                   ▼
              FOLLOW-UP
          Current report archived
          Analyst's instructions visible to technicians
          "Follow-up Required" shown on mobile
                   │
                   │ Technician taps "Start Re-visit"
                   ▼
              IN-PROGRESS (round 2+)
                   │
                   │ Technician submits new inspection report
                   ▼
           PENDING REVIEW (round 2+)
                   │
                   └─── cycle repeats until analyst approves
