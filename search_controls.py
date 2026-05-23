with open('user_html_step_223.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'controls' in line or 'btn' in line:
        print(f"Line {i+1}: {line.strip()}")
