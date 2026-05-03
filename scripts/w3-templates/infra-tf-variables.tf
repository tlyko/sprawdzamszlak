variable "admin_pass" {
  description = "Admin password used for HTTP Basic auth on /admin/* API endpoints (ADR-002). Set via TF_VAR_admin_pass before terraform apply; never commit."
  type        = string
  sensitive   = true
}
