terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Created by the bootstrap step, with object versioning on so a corrupted
  # apply can be rolled back to the previous state generation.
  backend "gcs" {
    bucket = "eyelecture-tfstate"
    prefix = "env/prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
