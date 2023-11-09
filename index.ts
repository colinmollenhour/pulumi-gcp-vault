import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// Create a GCS bucket to store Vault's data
const storageBucket = new gcp.storage.Bucket("vault-data", {
    location: "US",
});

// Create a KMS key for Vault's encryption keys
const keyRing = new gcp.kms.KeyRing("keyring", {
    location: "global",
});

const kmsKey = new gcp.kms.CryptoKey("vault-key", {
    keyRing: keyRing.id,
    rotationPeriod: "100000s",
});

// Docker image for Vault
const image = "vault:1.13.3";

// Create a Cloud Run service running Vault
const vault = new gcp.cloudrun.Service("vault", {
    location: "us-east1",
    template: {
        spec: {
            containers: [
                {
                    image,
                    envs: [
                        { name: "GOOGLE_PROJECT", value: gcp.config.project },
                        { name: "VAULT_ADDR", value: "http://0.0.0.0:8200" },
                        { name: "VAULT_LOCAL_CONFIG", value: pulumi.interpolate `
                            {
                                "storage": {
                                    "gcs": {"bucket":"${storageBucket.name}"}
                                },
                                "seal": {
                                    "gcpckms":{
                                        "project":"${project.projectId}",
                                        "region":"global",
                                        "key_ring":"${keyRing.name}",
                                        "crypto_key":"${kmsKey.name}"
                                    }
                                }
                            }` },
                    ],
                },
            ],
        },
    },
    traffics: [
        {
            percent: 100,
            latestRevision: true,
        },
    ],
});

export const projectLink = project.selfLink;
export const vaultUrl = vault.statuses[0].url;