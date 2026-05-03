# sprawdzamszlak-infrastructure

This repository contains the Terraform code used to define, deploy, and manage the cloud infrastructure for the **sprawdzamszlak** project on Amazon Web Services (AWS).

## Overview

This infrastructure is managed entirely as code (IaC) using Terraform. It leverages modern AWS best practices, including:
* **AWS IAM Identity Center (SSO):** For secure, short-lived credentials instead of static IAM keys.
* **Remote State Backend:** Uses an S3 bucket to securely store and version the Terraform state.
* **Default Tags:** All resources are automatically tagged with `Project`, `ManagedBy`, and `Environment` for cost tracking and organization.

## 📦 Infrastructure Components

The following AWS resources are managed by this Terraform configuration:

### API Gateway (HTTP API)
* Modern HTTP API endpoint with CORS support
* Default stage with auto-deployment
* Integration with Lambda function

### Lambda Function
* Python 3.13 runtime
* Handles data storage operations
* Environment variables for DynamoDB configuration

### DynamoDB
* Table: `sprawdzamszlak-data`
* Pay-per-request billing mode
* String partition key: `id`

### IAM
* Lambda execution role with:
  * DynamoDB access permissions (read/write)
  * CloudWatch Logs permissions
* Resource-specific IAM policies following least privilege principle

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
```

### 2. Initialize Terraform

Initialize the Terraform working directory and download required providers:

```bash
terraform init
```

### 3. Review Changes

Before applying changes, review the planned modifications:

```bash
terraform plan
```

### 4. Apply Changes

Deploy the infrastructure changes:

```bash
terraform apply
```

When prompted, review the changes and type `yes` to proceed.

### 5. Clean Up

To destroy all resources when they're no longer needed:

```bash
terraform destroy
```

## 📝 Important Notes

* The infrastructure is deployed to the `eu-west-1` region
* State is stored in an S3 bucket named `tfstate-214598715232-eu-west-1`
* The API endpoint URL will be displayed in the outputs after applying
* All resources are tagged with the project name and managed-by tags