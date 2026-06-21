```bash
ngrok http 3001
```

### 2) Backend

```bash
cd backend
npm install
npx prisma generate
npm run start:dev
```

Backend chạy tại:

```bash
http://localhost:3001/api
```

### 3) AI service

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

AI service chạy tại:

```bash
http://localhost:8001
```

### 4) Frontend

```bash
cd frontend
npm install
npm run dev -- -H 0.0.0.0
npm run dev
```

Frontend chạy tại:

```bash
http://localhost:3000
```

### 5) redis

//docker run -d --name travela-redis -p 6379:6379 redis:7

```bash
docker start travela-redis
docker stop travela-redis
```
