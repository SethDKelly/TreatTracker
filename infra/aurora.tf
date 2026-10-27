resource "aws_rds_cluster" "main" {
  cluster_identifier = "${var.name_prefix}-aurora"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = "15.10"
  database_name      = var.db_name
  master_username    = "treattracker"

  manage_master_user_password = true
  storage_encrypted           = true
  enable_http_endpoint        = true
  skip_final_snapshot         = true
  deletion_protection         = false
  copy_tags_to_snapshot       = true

  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_acu
    max_capacity = var.aurora_max_acu
  }

  tags = {
    Name = "${var.name_prefix}-aurora"
  }

  # EventBridge Scheduler owns runtime ACU range after create (seasonal scale up/down).
  lifecycle {
    ignore_changes = [serverlessv2_scaling_configuration]
  }
}

resource "aws_rds_cluster_instance" "main" {
  identifier         = "${var.name_prefix}-aurora-1"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  publicly_accessible = false

  tags = {
    Name = "${var.name_prefix}-aurora-1"
  }
}
