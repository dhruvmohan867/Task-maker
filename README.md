# Task Manager (Spring Boot + MongoDB + JWT)

A simple task manager with a web UI, JWT authentication (Sign in/Sign up), and role-based access.

## Tech Stack
- Spring Boot 3, Java 21
- MongoDB
- Thymeleaf (templates) + Bootstrap UI
- Spring Security + JWT (JJWT)

## Project Layout
- Backend entry: [`com.dhruv.taskmanager.TaskmanagerApplication`](src/main/java/com/dhruv/taskmanager/TaskmanagerApplication.java)
- Security: [`com.dhruv.taskmanager.security.SecurityConfig`](src/main/java/com/dhruv/taskmanager/security/SecurityConfig.java), [`com.dhruv.taskmanager.security.JwtService`](src/main/java/com/dhruv/taskmanager/security/JwtService.java), [`com.dhruv.taskmanager.security.JwtAuthFilter`](src/main/java/com/dhruv/taskmanager/security/JwtAuthFilter.java)
- Auth: [`com.dhruv.taskmanager.controller.AuthController`](src/main/java/com/dhruv/taskmanager/controller/AuthController.java), [`com.dhruv.taskmanager.repository.UserRepository`](src/main/java/com/dhruv/taskmanager/repository/UserRepository.java), [`com.dhruv.taskmanager.model.User`](src/main/java/com/dhruv/taskmanager/model/User.java)
- Views: [`src/main/resources/templates/dashboard.html`](src/main/resources/templates/dashboard.html), [`src/main/resources/static/main.css`](src/main/resources/static/main.css), [`src/main/resources/static/dashboard.js`](src/main/resources/static/dashboard.js)
- Config: [`pom.xml`](pom.xml), [`src/main/resources/application.properties`](src/main/resources/application.properties)

## Prerequisites
- JDK 21
- A MongoDB connection string
- Environment variables (do not hardcode secrets):
```
MONGODB_URI
APP_JWT_SECRET
APP_JWT_EXP_MIN (optional, default 120)
```

## Run (development)
Windows (PowerShell):
```powershell
$env:MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority"
$env:APP_JWT_SECRET="<long-random-secret>"
$env:APP_JWT_EXP_MIN="120"
.\mvnw clean spring-boot:run
```

Linux/macOS:
```sh
export MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority"
export APP_JWT_SECRET="<long-random-secret>"
export APP_JWT_EXP_MIN=120
./mvnw clean spring-boot:run
```

Open http://localhost:8080

Notes:
- An admin is seeded on first run by [`com.dhruv.taskmanager.TaskmanagerApplication`](src/main/java/com/dhruv/taskmanager/TaskmanagerApplication.java): username `admin`, password `admin123`.
- Public endpoints: `/`, `/ping`, `/auth/**`. `/api/**` requires JWT.

## API
Auth:
```http
POST /auth/signup
Body: { "username": "...", "password": "..." }
→ { "token": "<JWT>", "roles": ["USER"] }

POST /auth/login
Body: { "username": "...", "password": "..." }
→ { "token": "<JWT>", "roles": ["USER"|"ADMIN"] }
```

Tasks (Authorization: `Bearer <token>`):
```http
GET    /api/tasks
GET    /api/tasks/{id}
POST   /api/tasks            // create (owner = current user)
PUT    /api/tasks/{id}       // update
DELETE /api/tasks/{id}       // admin only by policy
```

Example curl:
```sh
TOKEN=$(curl -s -X POST localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .token)

curl -H "Authorization: Bearer $TOKEN" localhost:8080/api/tasks
```

## Build, Test, Package
```sh
./mvnw -DskipTests compile
./mvnw test
./mvnw package
```

## VS Code Tips
- Open the folder containing [`pom.xml`](pom.xml).
- Command Palette → “Maven: Reload Project”.
- Command Palette → “Java: Clean Java Language Server Workspace” → Restart.
- “Java: Configure Java Runtime” → set JDK 21.

## Security
- Keep secrets in env vars; do not commit credentials.
- Rotate any exposed MongoDB password and JWT secret.
- Consider adding `application.properties.example` and ignoring real `application.properties`.

## License
MIT (or add your preferred license).