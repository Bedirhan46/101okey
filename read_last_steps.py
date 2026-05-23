import json

log_path = r"C:\Users\bedir\.gemini\antigravity\brain\3f565452-25a4-4037-9c3e-b76ed82c9e64\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        step = json.loads(line)
        if 'tool_calls' in step:
            tcs = step['tool_calls']
            if isinstance(tcs, list):
                for tc in tcs:
                    name = tc.get('name', '')
                    args = tc.get('args', {})
                    target = args.get('TargetFile') or args.get('AbsolutePath') or ''
                    if 'write' in name or 'replace' in name:
                        # Clean target of unicode for safe printing
                        target_clean = target.encode('ascii', errors='ignore').decode('ascii')
                        print(f"Step {i}: tool={name}, target={target_clean}")
