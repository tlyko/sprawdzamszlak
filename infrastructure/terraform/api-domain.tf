# Custom domain for the HTTP API (ADR-008 PR 3).
#
# Why: Cloudflare Access can only sit in front of an origin that is
# proxied through Cloudflare DNS (orange cloud). The default
# *.execute-api hostname lives outside CF, so we register a CF-fronted
# subdomain `api.sprawdzamszlak.pl` and map it to the existing API GW
# stage. The legacy execute-api URL stays online (API GW does not turn
# it off); per ADR-008 D4 the Lambda re-verifies CF JWTs in code, so
# /admin/* on the legacy URL still rejects with 401.
#
# First apply will likely fail at the ACM validation step — owner must
# add the CNAME record produced by `aws_acm_certificate.api_cert`'s
# domain_validation_options into the Cloudflare DNS zone (DNS-only,
# gray cloud), then re-run the workflow. Subsequent applies converge.
# See `infrastructure/scripts/cf-access-setup.md` Faza B for the full
# runbook.

locals {
  api_domain = "api.sprawdzamszlak.pl"
}

# DNS-validated regional ACM certificate. API GW v2 HTTP API custom
# domains require the cert in the SAME region as the API (eu-west-1).
resource "aws_acm_certificate" "api_cert" {
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Wait until ACM marks the cert ISSUED (after owner adds the validation
# CNAME in Cloudflare DNS). Without this resource, the API GW domain
# below would race the validation and fail with "certificate not yet
# issued" on first apply. With it, terraform stalls at this step
# (default 45-min timeout) until the validation completes, then moves
# on. Owner's job: add CNAME, wait, re-run workflow if the timeout was
# hit before DNS propagated.
resource "aws_acm_certificate_validation" "api_cert" {
  certificate_arn = aws_acm_certificate.api_cert.arn

  # The DNS records themselves are not managed here — Cloudflare DNS
  # isn't in this Terraform's provider scope. ACM polls upstream and
  # this resource flips to ready as soon as the records resolve.
  # `validation_record_fqdns` is intentionally omitted.

  timeouts {
    create = "30m"
  }
}

# Regional custom domain for the HTTP API. The output `regional_domain_name`
# is the CNAME target for the proxied CF DNS record `api → ...`.
resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = local.api_domain

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.api_cert.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.api_cert]
}

# Map the existing prod stage at `/` of the new domain — i.e. requests
# to https://api.sprawdzamszlak.pl/admin/ping reach the same Lambda as
# https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/admin/ping.
resource "aws_apigatewayv2_api_mapping" "api_prod" {
  api_id      = aws_apigatewayv2_api.http_api.id
  domain_name = aws_apigatewayv2_domain_name.api.domain_name
  stage       = aws_apigatewayv2_stage.prod_stage.name
}

# Owner reads these after `terraform apply` completes successfully.
output "api_cert_validation_records" {
  description = "Add these CNAMEs in the Cloudflare DNS zone (DNS only, gray cloud). ACM polls them to validate the cert."
  value = [
    for option in aws_acm_certificate.api_cert.domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}

output "api_custom_domain_target" {
  description = "Add a CNAME `api → <this-value>` in Cloudflare DNS, with proxying enabled (orange cloud). This puts CF Access in front of the API."
  value       = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
}

output "api_custom_domain_url" {
  description = "Public base URL for the API once CF DNS + Access are configured."
  value       = "https://${local.api_domain}"
}
