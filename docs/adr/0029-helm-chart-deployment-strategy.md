# ADR-029. 인프라 배포 방식: Helm Chart 채택

- **Status**: 확정 (인프라 전체 방침, k8s_manager 매니페스트 전환 시점은 별도)

## Context

회의에서 K8s 클러스터 배포를 확정하고, 배포 도구로 **Helm Chart**를 채택했다. 개별 리소스는 `.yaml`로 정의하되, Helm이 이를 `templates/`로 템플릿화해서 `values.yaml`로 값을 주입하는 방식이다.

```
my-app/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── pvc.yaml
│   └── _helpers.tpl
└── charts/
```

## Decision

인프라 전체 배포는 Helm Chart 기준으로 간다. 환경별(dev/prod) `values-*.yaml`로 replica 수, 이미지 태그, 스토리지 크기 등을 코드 수정 없이 값만 바꿔 배포한다. `Chart.yaml`의 `appVersion`으로 오픈소스 버전을 명시한다([0037](0037-documentation-policy.md)의 "오픈소스 버전 명시" 요구사항과 연결).

## Consequences

- `k8s_manager`의 현재 `k8s/*.yaml`(rbac, configmap, secret, deployment, service, ingress)은 순수 K8s 매니페스트 형태로 당장은 유지 가능하지만, 인프라 전체가 Helm로 통일되는 시점에는 `k8s/templates/`로 옮기고 `Chart.yaml` + `values.yaml`을 추가하는 전환이 필요하다.
- 전환 시 `k8s/deployment.yaml`의 `replicas`, `image.repository`/`tag`, `k8s/configmap.yaml`의 값들이 `values.yaml`로 이동한다.
- 관련: [0036](0036-container-registry-selection.md)(이미지 태그 관리), [0031](0031-storage-solution.md)(PVC 템플릿화)
