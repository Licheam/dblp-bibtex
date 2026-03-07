FROM python:3.12-slim

WORKDIR /app

COPY index.html styles.css app.js server.py ./

EXPOSE 7860

CMD ["python", "server.py"]
