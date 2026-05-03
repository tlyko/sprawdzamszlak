# Adopts the per-account "Default-Services-Monitor" that AWS auto-creates.
# AWS limits dimensional monitors to 1 per account, so we import the
# existing one rather than creating a parallel.
resource "aws_ce_anomaly_monitor" "services" {
  name              = "Default-Services-Monitor"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "services" {
  name = "${local.app_name}-services"
  # AWS constraint: IMMEDIATE requires an SNS topic subscriber.
  # DAILY supports email directly and aggregates all anomalies from the
  # last 24h into one mail — sufficient for our low-volume use case.
  frequency = "DAILY"

  monitor_arn_list = [
    aws_ce_anomaly_monitor.services.arn,
  ]

  subscriber {
    type    = "EMAIL"
    address = local.owner_email
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      values        = ["1"]
      match_options = ["GREATER_THAN_OR_EQUAL"]
    }
  }
}
