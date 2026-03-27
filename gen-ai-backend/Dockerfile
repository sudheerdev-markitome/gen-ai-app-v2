# Use an official lightweight Python image as a base
FROM python:3.12-slim

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies needed for cryptography (jose)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file first to leverage Docker's layer caching
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code into the container
COPY . .

# The command to run your application when the container starts
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]