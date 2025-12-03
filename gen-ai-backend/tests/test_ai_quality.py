import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import AnswerRelevancyMetric, HallucinationMetric
import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure OPENAI_API_KEY is set in your environment for the Evaluator LLM to work
# os.environ["OPENAI_API_KEY"] = "sk-..." 

API_URL = "http://localhost:8000/api/generate"
# We need a valid token to call your API. For local testing, you might need to 
# generate a temporary one or temporarily disable auth for localhost in main.py.
# Or, simpler: Paste a valid token from your browser here for the test run.
TEST_AUTH_TOKEN = os.getenv("TEST_AUTH_TOKEN") 

def generate_response(prompt):
    """Helper to call your actual backend API"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TEST_AUTH_TOKEN}"
    }
    payload = {
        "prompt": prompt,
        "model": "gpt-4o"
    }
    try:
        response = requests.post(API_URL, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()['text']
    except Exception as e:
        pytest.fail(f"API Call failed: {e}")

# --- TEST CASES ---

# 1. Test for Relevance: Does the AI actually answer the specific marketing question?
def test_marketing_email_relevance():
    input_prompt = "Draft a cold email to a potential client for our SEO services."
    
    # Get the actual output from your app
    actual_output = generate_response(input_prompt)
    
    # Define the test case
    test_case = LLMTestCase(
        input=input_prompt,
        actual_output=actual_output
    )
    
    # Define the metric (Threshold is 0 to 1)
    relevancy_metric = AnswerRelevancyMetric(threshold=0.7)
    
    # Run the assertion
    assert_test(test_case, [relevancy_metric])

# 2. Test for Hallucination (Basic): Does the AI stick to facts?
# (Best used if you supply 'context', but useful for general checks too)
def test_general_fact_accuracy():
    input_prompt = "Who is the CEO of Tesla?"
    actual_output = generate_response(input_prompt)
    
    test_case = LLMTestCase(
        input=input_prompt,
        actual_output=actual_output,
        context=["Elon Musk is the CEO of Tesla."] # The 'truth' to compare against
    )
    
    # This metric checks if the output contradicts the context
    hallucination_metric = HallucinationMetric(threshold=0.5)
    
    assert_test(test_case, [hallucination_metric])

# 3. Test Agent Capability: Does it use the Time Tool correctly?
def test_server_time_tool():
    input_prompt = "What time is it on the server?"
    actual_output = generate_response(input_prompt)

    # We expect the output to contain a timestamp format (roughly)
    # We can use a custom heuristic or just check relevancy
    test_case = LLMTestCase(
        input=input_prompt,
        actual_output=actual_output
    )
    
    relevancy_metric = AnswerRelevancyMetric(threshold=0.8)
    assert_test(test_case, [relevancy_metric])


 