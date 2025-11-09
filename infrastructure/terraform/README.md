# sprawdzamszlak-infrastructure

This repository contains the Terraform code used to define, deploy, and manage the cloud infrastructure for the **sprawdzamszlak** project on Amazon Web Services (AWS).

## Overview

This infrastructure is managed entirely as code (IaC) using Terraform. It leverages modern AWS best practices, including:
* **AWS IAM Identity Center (SSO):** For secure, short-lived credentials instead of static IAM keys.
* **Remote State Backend:** Uses an S3 bucket to securely store and version the Terraform state.
* **Default Tags:** All resources are automatically tagged with `Project`, `ManagedBy`, and `Environment` for cost tracking and organization.

---

## 🚀 Prerequisites

Before you can run any Terraform commands, you must have the following set up:

1.  **Terraform:** Install the [Terraform CLI](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli).
2.  **AWS CLI v2:** Install the [AWS CLI](https://aws.amazon.com/cli/).
3.  **AWS SSO Profile:** This repository is configured to use an AWS SSO profile. You must configure your local AWS CLI to use your SSO credentials as the `[default]` profile.

    * Run the configuration wizard:
        ```bash
        aws configure sso
        ```
    * Follow the prompts, providing your **SSO start URL** and **SSO region**.
    * When asked for a profile name, make sure to set it as `default`.

---

## 🛠️ How to Use

### 1. Log in to AWS SSO

Before running any Terraform commands, you must authenticate with AWS to get temporary credentials.

```bash
aws sso login