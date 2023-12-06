import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// Get the project based on ID from config
const config = new pulumi.Config()
const vaultDomain = config.get('vaultDomain') // Optional
const project = gcp.organizations.getProjectOutput({})
const defaultServiceAccount = gcp.compute.getDefaultServiceAccountOutput({});

// Create a GCS bucket to store Vault's data
const storageBucket = new gcp.storage.Bucket("vault-data", {
    location: "US",
});

// Create a KMS keyring and key for Vault's encryption keys
const keyRing = new gcp.kms.KeyRing("vault-server", {
    location: "global",
});
const kmsKey = new gcp.kms.CryptoKey("seal", {
    keyRing: keyRing.id,
    purpose: "ENCRYPT_DECRYPT",
    rotationPeriod: "100000s",
});

// Allow the service account permissions for the KMS key
const adminPolicy = gcp.organizations.getIAMPolicyOutput({
    bindings: defaultServiceAccount.email.apply(email => [
        {
            members: [`serviceAccount:${email}`],
            role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
        },
    ]),
});
const cryptoKey = new gcp.kms.CryptoKeyIAMPolicy("cryptoKey", {
    cryptoKeyId: kmsKey.id,
    policyData: adminPolicy.policyData,
});

// Docker image for Vault
const image = "hashicorp/vault:1.15";

// Create a Cloud Run service running Vault
const vault = new gcp.cloudrunv2.Service("vault", {
    description: "HashiCorp Vault Service",
    ingress: "INGRESS_TRAFFIC_ALL",
    location: gcp.config.region,
    template: {
        containers: [
            {
                image,
                commands: ["/usr/local/bin/docker-entrypoint.sh", "server"],
                ports: [{
                    containerPort: 8200,
                    name: "http1",
                }],
                resources: {
                    cpuIdle: true,
                    limits: {
                        cpu: "1",
                        memory: "256Mi",
                    },
                },
                startupProbe: {
                    httpGet: {
                        path: "/",
                        port: 8200,
                    },
                },
                envs: [
                    { name: "GOOGLE_PROJECT", value: gcp.config.project },
                    { name: "SKIP_SETCAP", value: "1" },
                    { name: "VAULT_LOCAL_CONFIG", value: pulumi.interpolate `
                        {
                            "ui": true,
                            "disable_mlock": true,
                            "disable_clustering": true,
                            "listener": {
                                "tcp": {
                                    "address": "0.0.0.0:8200",
                                    "tls_disable": true
                                },
                            },
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
                        }`
                    },
                ],
            },
        ],
        scaling: {
            minInstanceCount: 0,
            maxInstanceCount: 1,
        }
    },
    labels: {
        "service": "vault",
    },
}, {
    deleteBeforeReplace: true
});

let _vaultUrl
if (vaultDomain) {
    const domainMapping = new gcp.cloudrun.DomainMapping("vault-domain", {
        name: vaultDomain,
        location: pulumi.interpolate`${gcp.config.region}`,
        metadata: {
            namespace: pulumi.interpolate`${project.projectId}`
        },
        spec: {
            routeName: vault.uri.apply(uri => uri.replace('https://', ''))
        }
    })
    _vaultUrl = `https://${vaultDomain}`
} else {
    _vaultUrl = vault.uri
}
export const vaultUrl = _vaultUrl