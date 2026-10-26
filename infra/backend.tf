terraform {
  backend "s3" {
    bucket         = "aws-backbone-terraform-state-521018312783"
    key            = "treattracker/dev/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "aws-backbone-terraform-locks"
    encrypt        = true
  }
}
