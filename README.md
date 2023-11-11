# Serverless Vault with Pulumi and Cloud Run

This is a Pulumi stack to run Hashicorp Vault based on the [Serverless Vault with Cloud Run](https://github.com/kelseyhightower/serverless-vault-with-cloud-run)
tutorial by [@kelseyhightower](https://github.com/kelseyhightower). The goal is to have a Vault instance that
is:

- Extremely reliable
- Zero maintenance
- Secure
- Repeatable
- Dirt cheap!

Stack:
- Hashicorp Vault using the official Docker images running on Google Cloud Run
- Google Cloud Storage is used as a storage and logging backend
- Google Key Management is used to unseal the vault automatically
- Everything is created automatically with Pulumi (similar to Terraform)

This is my first Pulumi project, so I'm sure it could be improved. Please feel free to contribute improvements as pull requests!

# Prerequisites

1. Clone this repository and cd into the root directory
2. Install Node (example for `pnpm` - `npm` works, too)
   ```shell
   curl -fsSL https://get.pnpm.io/install.sh | sh -
   pnpm env use --global lts
   pnpm i
   ```
3. Install Pulumi CLI
   ```shell
   curl -fsSL https://get.pulumi.com | sh
   pulumi login --local
   pulumi stack select dev
   ```
4. Install gcloud CLI
   ```shell
   curl https://sdk.cloud.google.com | bash
   gcloud init
   gcloud auth application-default login
   gcloud config set project $(pulumi config get gcp:project)
   ```
5. Create the gcloud project and assign a billing account if needed (can also be done [online](https://console.cloud.google.com/welcome)):
   ```shell
   gcloud projects create $(pulumi config get gcp:project) [--folder=FOLDER_ID] [--name=NAME] [--organization=ORGANIZATION_ID]
   gcloud billing accounts list
   gcloud billing projects link $(pulumi config get gcp:project) --billing-account 0X0X0X-0X0X0X-0X0X0X
   ```
6. Ensure the required APIs are enabled (Compute is needed to retrieve the default service account email):
    ```shell
    gcloud services enable --project=$(pulumi config get gcp:project) --async \
      compute.googleapis.com \
      cloudkms.googleapis.com \
      run.googleapis.com \
      secretmanager.googleapis.com \
      storage.googleapis.com
    ```

# Deploying Vault

1. Deploy the Vault service:
    ```shell
    pulumi up
    export VAULT_ADDR=$(pulumi stack output vaultUrl)
    ```
2. Initialize the Vault. Save the recovery key somewhere safe!!:
   ```shell
   curl -s -X PUT \
     ${VAULT_ADDR}/v1/sys/init \
     -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
     --data @init.json
   ```
3. Get the Vault health information:
   ```shell
   curl -s -X GET \
     ${VAULT_ADDR}/v1/sys/health \
     -H "Authorization: Bearer $(gcloud auth print-identity-token)"
   ```
   or
   ```shell
   vault status --header "Authorization=Bearer $(gcloud auth print-identity-token)"
   ```
   At this point you will need to **allow unauthorized access** on your service to continue with the examples or else
   always use `--header="Authorization=Bearer $(gcloud auth print-identity-token)"` with each `vault` command.

4. Login with the root token received from the init step:
   ```shell
   vault login
   ```
5. And try storing a secret:
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

From this point you will probably want to set up a permanent domain name and restrict the access to the
service to bolster security. But, you now have a working Hashicorp Vault service that, while not "highly
available", should still be extremely reliable for small deployments.