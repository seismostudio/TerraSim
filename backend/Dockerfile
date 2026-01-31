# Use official Python image as a base
FROM python:3.11-slim

# Set working directory to /app
# We will place the 'backend' folder inside here to maintain package structure
WORKDIR /app

# Install system dependencies (needed for scipy/triangle if they don't have wheels)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from the current directory (build context is backend/)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend files into /app/backend
# This ensures that 'from backend.xxx' works because we add /app to PYTHONPATH
COPY . ./backend/

# Move to the backend directory
WORKDIR /app/backend

# Add /app to PYTHONPATH so 'backend' package is found
ENV PYTHONPATH=/app

# Expose the port FastAPI will run on
EXPOSE 8010

# Command to run the application (now from /app/backend)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]
