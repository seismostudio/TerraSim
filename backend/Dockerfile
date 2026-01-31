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
# This ensures that 'import backend.xxx' works because we run from /app
COPY . ./backend/

# Expose the port FastAPI will run on
EXPOSE 8000

# Command to run the application
# We use 'backend.main:app' and run from /app
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
