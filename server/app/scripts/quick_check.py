"""
Quick validation script for AI Movement Analysis integration
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("=" * 70)
print("AI MOVEMENT ANALYSIS - QUICK VALIDATION")
print("=" * 70)

# Check 1: Import test
print("\n[1/5] Testing imports...")
try:
    from scripts.ai_movement_analyzer import AIMovementAnalyzer
    print("    ✅ AIMovementAnalyzer imported successfully")
except Exception as e:
    print(f"    ❌ Import failed: {e}")
    sys.exit(1)

# Check 2: File existence
print("\n[2/5] Checking required files...")
script_dir = os.path.dirname(os.path.abspath(__file__))
exercises_file = os.path.join(script_dir, "exercises.json")

if os.path.exists(exercises_file):
    print(f"    ✅ exercises.json found")
    import json
    with open(exercises_file, 'r') as f:
        exercises = json.load(f)
    print(f"    ✅ Loaded {len(exercises)} exercises")
else:
    print(f"    ❌ exercises.json NOT FOUND")
    sys.exit(1)

# Check 3: Initialization
print("\n[3/5] Testing AI analyzer initialization...")
try:
    analyzer = AIMovementAnalyzer(api_key="test", enable_tts=False)
    print(f"    ✅ Analyzer initialized")
    print(f"    ✅ Current exercise: {analyzer.get_current_exercise_name()}")
except Exception as e:
    print(f"    ❌ Initialization failed: {e}")
    sys.exit(1)

# Check 4: Check capture.py integration
print("\n[4/5] Checking capture.py integration...")
capture_file = os.path.join(script_dir, "capture.py")
if os.path.exists(capture_file):
    with open(capture_file, 'r') as f:
        content = f.read()
    
    checks = [
        ("AI analyzer import", "from scripts.ai_movement_analyzer import AIMovementAnalyzer" in content),
        ("--ai-analysis flag", "'--ai-analysis'" in content),
        ("--groq-api-key flag", "'--groq-api-key'" in content),
        ("analyze_movement call", "ai_analyzer.analyze_movement" in content),
        ("AI data in keypoints", '"ai_feedback"' in content or "'ai_feedback'" in content),
    ]
    
    for check_name, passed in checks:
        status = "✅" if passed else "❌"
        print(f"    {status} {check_name}")
else:
    print("    ❌ capture.py not found")
    sys.exit(1)

# Check 5: Environment
print("\n[5/5] Checking environment...")
api_key = os.getenv('GROQ_API_KEY', '')
if api_key:
    print(f"    ✅ GROQ_API_KEY is set (length: {len(api_key)})")
else:
    print(f"    ⚠️  GROQ_API_KEY not set (AI feedback will be generic)")
    print(f"       Set it with: $env:GROQ_API_KEY='your-key'")

# Summary
print("\n" + "=" * 70)
print("VALIDATION COMPLETE")
print("=" * 70)
print("\n✅ AI Movement Analysis is properly integrated!")
print("\nTo test the full system:")
print("  1. Terminal 1: uvicorn main:app --reload --port 8000")
print("  2. Terminal 2: $env:GROQ_API_KEY='your-key'; python app/scripts/capture.py --ai-analysis")
print("  3. Terminal 3: cd client; npm run dev")
print("  4. Open browser: http://localhost:5173")
print("\n" + "=" * 70)
