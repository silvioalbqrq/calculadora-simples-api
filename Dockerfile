# Motor oficial do Simples Nacional (Receita Federal, MIT):
# container com o jar deste projeto e a base gerada pelas migracoes.
# O jar foi compilado para Java 25; o launcher roda em Node.
FROM eclipse-temurin:25-jdk

RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY motor-simples/target/api-simples-nacional.jar ./motor-simples/target/api-simples-nacional.jar
COPY motor-simples/calculadora/db/calculadora-pro.db ./motor-simples/calculadora/db/calculadora-pro.db
COPY calculadora-service/package.json calculadora-service/launcher.mjs ./calculadora-service/
WORKDIR /app/calculadora-service

ENV JAVA_EXE=/opt/java/openjdk/bin/java
ENV SPRING_PROFILES_ACTIVE=offline
ENV PORT=10000

EXPOSE 10000
CMD ["node", "launcher.mjs"]
