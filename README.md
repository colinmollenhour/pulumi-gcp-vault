# Serverless Vault with Pulumi and Cloud Run

[![Deploy](https://get.pulumi.com/new/button.svg)](https://app.pulumi.com/new?template=https://github.com/colinmollenhour/pulumi-gcp-vault)

This is a Pulumi stack to run Hashicorp Vault based on the [Serverless Vault with Cloud Run](https://github.com/kelseyhightower/serverless-vault-with-cloud-run)
tutorial by [@kelseyhightower](https://github.com/kelseyhightower). The goal is to have a Vault instance that is:

- Extremely reliable
- Zero maintenance
- Secure
- Repeatable
- Dirt cheap!

Stack:
- Google Cloud Run is used to run Hashicorp Vault using the official Docker images
- Google Cloud Storage is used as a storage and logging backend
- Google Key Management is used to unseal the vault automatically
- A Domain Mapping is optionally used to set up your own custom domain
- Everything is created automatically with Pulumi (similar to Terraform)

This is my first Pulumi project, so I'm sure it could be improved. Please feel free to contribute improvements as pull requests!

# Prerequisites

If using Pulumi Cloud and you already have GCP setup for Deployments, just make sure your GCP account has the
required APIs enabled (step 5).
Otherwise, you can deploy this project using Pulumi CLI locally with just `Node`, `pulumi` and `gcloud`.

1. Install Node and dependencies
   ```shell
   curl -fsSL https://get.pnpm.io/install.sh | sh -
   pnpm env use --global lts
   ```
2. Install Pulumi CLI
   ```shell
   curl -fsSL https://get.pulumi.com | sh
   pulumi login --local
   ```
3. Install Google Cloud CLI
   ```shell
   curl https://sdk.cloud.google.com | bash
   gcloud init
   gcloud auth application-default login
   gcloud config set project $(pulumi config get gcp:project)
   ```
4. Create the gcloud project and assign a billing account if needed (can also be done [online](https://console.cloud.google.com/welcome)):
   ```shell
   gcloud projects create $(pulumi config get gcp:project) [--folder=FOLDER_ID] [--name=NAME] [--organization=ORGANIZATION_ID]
   gcloud billing accounts list
   gcloud billing projects link $(pulumi config get gcp:project) --billing-account 0X0X0X-0X0X0X-0X0X0X
   ```
5. Ensure the required APIs are enabled (Compute is needed to retrieve the default service account email):
    ```shell
    gcloud services enable --project=$(pulumi config get gcp:project) --async \
      compute.googleapis.com \
      cloudkms.googleapis.com \
      run.googleapis.com \
      secretmanager.googleapis.com \
      storage.googleapis.com
    ```

# Deploying Vault

1. Create a fresh directory for the project and create the stack from this repository as a template:
   ```shell
   mkdir vault && cd vault
   pulumi new https://github.com/colinmollenhour/pulumi-gcp-vault
   ```
2. Deploy the new stack:
    ```shell
    pulumi up
    export VAULT_ADDR=$(pulumi stack output vaultUrl)
    ```
3. Initialize the Vault. Save the recovery key somewhere safe!!:
   ```shell
   curl -s -X PUT \
     ${VAULT_ADDR}/v1/sys/init \
     -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
     --data @vault-init.json
   ```
4. Get the Vault health information:
   ```shell
   curl -s -X GET \
     ${VAULT_ADDR}/v1/sys/health \
     -H "Authorization: Bearer $(gcloud auth print-identity-token)"
   ```
   or
   ```shell
   vault status --header "Authorization=Bearer $(gcloud auth print-identity-token)"
   ```
5. At this point you will need to **allow unauthorized access** on your service to continue with the examples or else
   always use `--header="Authorization=Bearer $(gcloud auth print-identity-token)"` with each `vault` command. To allow
   public access, you can change the 'publicAccess config'
   ```shell
   pulumi config set publicAccess true
   pulumi up
   ```
6. Login with the root token received from the init step:
   ```shell
   vault login
   ```
7. And try storing a secret:
   ```shell
   vault secrets enable -version=2 -path=secret kv
   vault policy write my-policy - << EOF
   path "secret/data/*" {
     capabilities = ["create", "read", "update", "delete", "list"]
   }
   EOF
   export VAULT_TOKEN="$(vault token create -field token -policy=my-policy)"
   vault kv put -mount=secret testing passcode=NotActuallySecret
   ```
   
# Next Steps

From this point you will probably want to restrict the access to the service to bolster security. But, you now have
a working self-hosted but serverless Hashicorp Vault service that, while not "highly available", should still be
extremely reliable for small deployments.