"""Find where an unterminated triple-quoted string starts in streamlit_app.py"""
import re

with open('streamlit_app.py', encoding='utf-8') as f:
    content = f.read()
    lines = content.splitlines()

# Scan for triple-quote positions to find which one is unclosed
print("=== Scanning triple-quoted strings ===")
pos = 0
string_stack = []
i = 0
while i < len(content):
    # Check for triple-double-quote
    if content[i:i+3] == '"""':
        line_num = content[:i].count('\n') + 1
        col = i - content[:i].rfind('\n') - 1
        if string_stack and string_stack[-1][0] == '"""':
            closed = string_stack.pop()
            print(f"  CLOSED triple-\"\"\" opened at L{closed[1]} -> closed at L{line_num}")
        else:
            string_stack.append(('"""', line_num, col))
            print(f"  OPENED triple-\"\"\" at L{line_num} col {col}")
        i += 3
        continue
    # Check for triple-single-quote
    if content[i:i+3] == "'''":
        line_num = content[:i].count('\n') + 1
        col = i - content[:i].rfind('\n') - 1
        if string_stack and string_stack[-1][0] == "'''":
            closed = string_stack.pop()
            print(f"  CLOSED triple-''' opened at L{closed[1]} -> closed at L{line_num}")
        else:
            string_stack.append(("'''", line_num, col))
            print(f"  OPENED triple-''' at L{line_num} col {col}")
        i += 3
        continue
    i += 1

print()
if string_stack:
    for item in string_stack:
        print(f"*** UNCLOSED {item[0]} opened at L{item[1]} col {item[2]} ***")
        # Print the surrounding lines
        ln = item[1]
        print(f"  Line {ln}:   {repr(lines[ln-1])}")
        if ln < len(lines):
            print(f"  Line {ln+1}: {repr(lines[ln])}")
else:
    print("All triple-quoted strings are balanced.")

print()
# Also check for any non-UTF8 chars or BOMs
print("=== Checking for encoding issues ===")
with open('streamlit_app.py', 'rb') as f:
    raw = f.read()

if raw.startswith(b'\xef\xbb\xbf'):
    print("WARNING: BOM detected at start of file!")
else:
    print("No BOM.")

# Find any null bytes
nulls = [i for i, b in enumerate(raw) if b == 0]
if nulls:
    print(f"WARNING: Null bytes at positions: {nulls}")
else:
    print("No null bytes.")

# Check for any non-UTF8 sequences
try:
    raw.decode('utf-8')
    print("File is valid UTF-8.")
except UnicodeDecodeError as e:
    print(f"UTF-8 decode error: {e}")
