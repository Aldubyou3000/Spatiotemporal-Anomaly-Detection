# Save reminder design

Implemented 2026-10-25.

Problem: the long continuation label wrapped independently below the other controls, while two filled blue buttons competed for priority. The paragraph and tinted footer made a routine save question unnecessarily heavy.

Use the established unsaved-document confirmation pattern:

- Title: Save this run?
- Session navigation copy: Your run stays in Zones for this session. Save it to History to keep it.
- Actions, left to right: Cancel (quiet), Don’t save (secondary), Save (the only filled primary action).
- Don’t save continues dashboard navigation with the current in-memory run intact. Destructive replacements still say Discard and explain the loss.
- Shared button height/type; one right-aligned footer row at ordinary widths. Below 400px, deliberately use full-width stacked actions instead of accidental partial wrapping.
- White surface, consistent inset, bounded content height, no extra footer tint or shadow.
- Cancel receives initial focus for three-way/destructive decisions; Tab stays in the dialog, Escape cancels and closing restores the trigger when it still exists. Save completion/error/navigation behavior is unchanged.

Reference conventions: [Microsoft confirmation labels](https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-confirm) documents Save / Don’t save; [Material dialog layout guidance](https://m1.material.io/components/dialogs.html#dialogs-specs) distinguishes side-by-side and deliberately stacked actions. These inform the interaction and layout; website tokens provide Sentinel's appearance.

Implementation: ConfirmDialog uses the existing Button primitive and ConfirmDialog.module.css. The UI Library Dialogs group includes a Save reminder example. Three focused dialog tests cover action hierarchy, destructive defaults and keyboard behavior; navigation tests retain run/save/error guarantees. Hydrated browser layout remains unverified because browser automation is disabled in this session.
