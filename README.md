<p align="right">
    <a href="CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg" alt="Code of conduct"></a>
</p>

<p align="center">
    <h1 align="center">API Scoring System (Fork v1.0.1)</h1>
    <p align="center">A microservice, its API, and a CLI.<br>Reaching API Design efficiency was never that easy.</p>
    <p align="center"><strong><a href="https://inditextech.github.io/api-scoring-doc/">Check the original doc!</a></strong></p>
    <br>
</p>

This repository contains the Scoring Service along with its API, responsible for getting a grade for APIs, and a CLI tool called `apicli`, which makes requests to the scoring system to get your API a score.

**Note about this Fork (v1.0.1):** This is a modified version of the original project, maintained by `rgranadosd`. Version `1.0.1` includes specific adjustments for configuration and execution in containerized environments, ensuring the scoring calculation works as expected.

> You can find further information regarding the original **API Scoring Suite** in their [documentation site](https://inditextech.github.io/api-scoring-doc/)!

<br>

## Installation

The following sections describe different ways to set up and run the project.

### Manual Installation (for development or specific components)

You can see that in the root of this repository, there is a `package/` folder. This folder contains both the [microservice package](/packages/certification-service) and the [CLI package](/packages/api-cli#apicli---cli).

To proceed with their individual installation, please, place yourself in their path and follow the installation guides suggested in their respective READMEs.

### Running with Docker / Podman (Clean Install using Compose)

This is the recommended way to run the `certification-service` for a clean, containerized deployment. This fork includes a `Dockerfile` and a `docker-compose.yml` file to facilitate this.

**Prerequisites:**
* Git
* Docker Desktop installed and running, OR Podman with `podman-compose` (or basic Podman commands).
    * For `podman-compose`, ensure it's installed (e.g., `pip install podman-compose`).

**Steps:**

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/rgranadosd/api-scoring-engine.git](https://github.com/rgranadosd/api-scoring-engine.git)
    cd api-scoring-engine
    ```

2.  **Build and run the service using Docker Compose or Podman Compose:**
    * **Using Docker Compose:**
        ```bash
        docker-compose up --build -d
        ```
    * **Using Podman Compose:**
        ```bash
        podman-compose up --build -d
        ```
    This command will build the Docker image (named `scoring-api` as per `docker-compose.yml`, using the `Dockerfile` in the root) and start the service in detached mode (`-d`). The service will be accessible on your host machine.

3.  **Accessing the Service:**
    Once the container is running, the API Scoring service should be available at `http://localhost:8088` (as defined by the `ports` mapping `"8088:8080"` in `docker-compose.yml`). You can test an endpoint like `http://localhost:8088/apifirst/v1/apis/score-file` using a tool like `curl` or Postman.

4.  **Checking Logs:**
    * Docker Compose: `docker-compose logs -f scoring-api`
    * Podman Compose: `podman-compose logs -f scoring-api` (or `podman logs -f <container_id_or_name>`)

5.  **Stopping the Service:**
    * Docker Compose: `docker-compose down`
    * Podman Compose: `podman-compose down`

**Important Note on Configuration:**
For the scoring to work correctly, ensure the necessary scoring weights are defined as detailed in the "Configuration for Containerized Execution" section below. The `config/default.yml` file (or other active YAML configuration) in the repository is used by the container.

<br>

## Configuration for Containerized Execution (Fork v1.0.1)

For the API Scoring System to function correctly, especially when running within a container (e.g., using the provided `Dockerfile` and `docker-compose.yml`), it's crucial to have the scoring weights properly configured. These weights determine how different aspects of an API (Design, Security, Documentation) contribute to the overall score.

The primary configuration file for these settings is typically `config/default.yml` (or other YAML files loaded by the `config` library, such as `packages/certification-service/code/config/configmap_local.yml`, depending on your environment). This file is included in the Docker image during the build process.

Ensure the following YAML structure and keys are present and correctly defined with numerical values in your active configuration file:

```yaml
cerws:
  # ... other existing configurations ...

  certification:
    scoring:
      # Weights for Overall Score calculation
      modules-weights:
        design: 0.5        # Example: 50%
        documentation: 0.1 # Example: 10% (Note: current usecase might set REST documentation score to 0)
        security: 0.4      # Example: 40%

      # Weights for scenarios where security is not evaluated
      modules-weights-without-security:
        design: 0.8        # Example: 80%
        documentation: 0.2 # Example: 20%

      # Coefficient for error impact in individual ruleset scoring
      error-coefficient-weight: 1.5 # Example value
  
  markdown:
    # ... other markdown configurations ...
    scoring:
      rules-weights:
        base-rules: 0.6 # Example, 60%
        custom-rules: 0.4 # Example, 40%