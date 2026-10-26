data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.name_prefix}-vpc"
  }
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.name_prefix}-private-${count.index}"
  }
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${var.name_prefix}-aurora"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.name_prefix}-aurora"
  }
}

resource "aws_security_group" "aurora" {
  name        = "${var.name_prefix}-aurora"
  description = "Aurora access via Data API / VPC only"
  vpc_id      = aws_vpc.main.id

  # Data API does not require inbound from Lambda; keep SG locked down.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-aurora"
  }
}
