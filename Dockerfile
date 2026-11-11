FROM mcr.microsoft.com/playwright/python:v1.56.0-noble
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY index.html online.js app.py ./
ENV PORT=8080
EXPOSE 8080
CMD ["python", "app.py"]
