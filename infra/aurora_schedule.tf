# Seasonal Aurora ACU scaling via EventBridge Scheduler (no Lambda).
# Matches app season (America/Chicago): open Oct 24 00:00, close Nov 1 12:00.
# Scale up: Oct 23 12:00 CT (warm before open). Scale down: Nov 1 13:00 CT (after close).

resource "aws_iam_role" "aurora_scheduler" {
  name = "${var.name_prefix}-aurora-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "aurora_scheduler" {
  name = "${var.name_prefix}-aurora-scheduler"
  role = aws_iam_role.aurora_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ModifyAuroraCapacity"
      Effect   = "Allow"
      Action   = ["rds:ModifyDBCluster"]
      Resource = aws_rds_cluster.main.arn
    }]
  })
}

resource "aws_scheduler_schedule" "aurora_scale_up" {
  name                         = "${var.name_prefix}-aurora-scale-up"
  description                  = "Raise Aurora ACUs before TreatTracker season opens (Oct 23 noon CT)"
  schedule_expression          = var.aurora_scale_up_cron
  schedule_expression_timezone = "America/Chicago"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:modifyDBCluster"
    role_arn = aws_iam_role.aurora_scheduler.arn
    input = jsonencode({
      DbClusterIdentifier = aws_rds_cluster.main.id
      ApplyImmediately    = true
      ServerlessV2ScalingConfiguration = {
        MinCapacity = var.aurora_min_acu
        MaxCapacity = var.aurora_max_acu
      }
    })
  }
}

resource "aws_scheduler_schedule" "aurora_scale_down" {
  name                         = "${var.name_prefix}-aurora-scale-down"
  description                  = "Drop Aurora min ACU to 0 after TreatTracker season closes (Nov 1 1pm CT)"
  schedule_expression          = var.aurora_scale_down_cron
  schedule_expression_timezone = "America/Chicago"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:modifyDBCluster"
    role_arn = aws_iam_role.aurora_scheduler.arn
    input = jsonencode({
      DbClusterIdentifier = aws_rds_cluster.main.id
      ApplyImmediately    = true
      ServerlessV2ScalingConfiguration = {
        MinCapacity           = var.aurora_off_min_acu
        MaxCapacity           = var.aurora_off_max_acu
        SecondsUntilAutoPause = var.aurora_auto_pause_seconds
      }
    })
  }
}
