package platform

import (
	"testing"

	"github.com/intmian/platform/backend/share"
)

func TestResolveD1LogWorkerConfig(t *testing.T) {
	t.Setenv("PLATFORM_D1_LOG_WORKER_ENDPOINT", "")
	t.Setenv("PLATFORM_D1_LOG_WORKER_TOKEN", "")

	endpoint, token, err := resolveD1LogWorkerConfig(share.BaseSetting{
		D1LogWorkerEndpoint: "https://log.example.com",
		D1LogWorkerToken:    "configured-token",
	})
	if err != nil {
		t.Fatalf("resolve log worker config: %v", err)
	}
	if endpoint != "https://log.example.com" || token != "configured-token" {
		t.Fatalf("unexpected log worker config: endpoint=%q token=%q", endpoint, token)
	}
}

func TestResolveD1LogWorkerConfigEnvironmentOverridesBaseSetting(t *testing.T) {
	t.Setenv("PLATFORM_D1_LOG_WORKER_ENDPOINT", "https://override.example.com")
	t.Setenv("PLATFORM_D1_LOG_WORKER_TOKEN", "override-token")

	endpoint, token, err := resolveD1LogWorkerConfig(share.BaseSetting{
		D1LogWorkerEndpoint: "https://configured.example.com",
		D1LogWorkerToken:    "configured-token",
	})
	if err != nil {
		t.Fatalf("resolve log worker config: %v", err)
	}
	if endpoint != "https://override.example.com" || token != "override-token" {
		t.Fatalf("environment did not override log worker config: endpoint=%q token=%q", endpoint, token)
	}
}

func TestResolveD1LogWorkerConfigRequiresEndpointAndToken(t *testing.T) {
	t.Setenv("PLATFORM_D1_LOG_WORKER_ENDPOINT", "")
	t.Setenv("PLATFORM_D1_LOG_WORKER_TOKEN", "")

	if _, _, err := resolveD1LogWorkerConfig(share.BaseSetting{}); err == nil {
		t.Fatal("expected missing endpoint error")
	}
	if _, _, err := resolveD1LogWorkerConfig(share.BaseSetting{
		D1LogWorkerEndpoint: "https://log.example.com",
	}); err == nil {
		t.Fatal("expected missing token error")
	}
}
