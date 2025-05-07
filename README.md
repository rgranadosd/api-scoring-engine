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

You can see that in the root of this repository, there is a `package/` folder. This folder contains both the [microservice package](/packages/certification-service) and the [CLI package](/packages/api-cli#apicli---cli).

To proceed with their installation, please, place yourself in their path and follow the installation guides suggested in the READMEs.

<br>

## Configuration for Containerized Execution (Fork v1.0.1)

For the API Scoring System to function correctly, especially when running within a container (e.g., using the provided `Dockerfile` and `docker-compose.yml`), it's crucial to have the scoring weights properly configured. These weights determine how different aspects of an API (Design, Security, Documentation) contribute to the overall score.

The primary configuration file for these settings is typically `config/default.yml` (or other YAML files loaded by the `config` library, such as `packages/certification-service/code/config/configmap_local.yml`, depending on your environment).

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