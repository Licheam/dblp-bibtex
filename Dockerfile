FROM python:3.12-slim

WORKDIR /app

COPY index.html styles.css app.js ./

EXPOSE 7860

CMD ["python", "-m", "http.server", "7860", "--bind", "0.0.0.0"]
