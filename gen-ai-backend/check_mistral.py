
import mistralai
print(f"MistralAI version: {mistralai.__version__ if hasattr(mistralai, '__version__') else 'unknown'}")
try:
    from mistralai import Mistral
    print("Successfully imported Mistral from mistralai")
except ImportError as e:
    print(f"FAILED to import Mistral from mistralai: {e}")
