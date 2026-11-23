# syntax=docker/dockerfile:1
# Backend images for deploy/docker-compose.yml (build context: backend/).
#   target api           HTTP API; also runs the one-shot `seed` command
#   target judge-worker  same jar plus the Docker CLI, started with `judge-worker`
# Tests are not run here; CI runs them on every pull request.

FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 sh ./mvnw -B -ntp -q dependency:go-offline
COPY src src
RUN --mount=type=cache,target=/root/.m2 sh ./mvnw -B -ntp -q -DskipTests package \
    && cp target/backend-*.jar /app.jar

FROM eclipse-temurin:25-jre AS api
RUN useradd --system --uid 10002 --home-dir /app leetkob
WORKDIR /app
COPY --from=build /app.jar /app/app.jar
USER leetkob
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]

FROM api AS judge-worker
COPY --from=docker:28-cli /usr/local/bin/docker /usr/local/bin/docker

# Pre-launch check on the VM (README, "Deployment runbook"): DockerSandboxTest against the
# host daemon through the mounted socket. Not used by any long-running service.
FROM eclipse-temurin:25-jdk AS sandbox-check
COPY --from=docker:28-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
COPY src src
ENV JUDGE_SANDBOX_TESTS=1
ENTRYPOINT ["sh", "./mvnw", "-B", "-ntp", "-Dtest=DockerSandboxTest", "test"]
