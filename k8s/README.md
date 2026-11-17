# k8s/ — 플랫폼 매니페스트

k8s-manager 앱 차트는 **`myorg/deploy-infra` 의 `apps/k8s-manager/`** 로 이전됐다 (2026-11-12, ArgoCD 자동 동기화).
배포 설정은 그쪽에서 바꾸고, 이미지 태그는 이 저장소 main push 시 CI 가 자동 갱신한다.

이 폴더에 남은 것은 ArgoCD 가 관리하지 않는 플랫폼 구성이다 (사람이 `helm` / `kubectl apply` 로 직접 적용).

| 파일 | 대상 | 적용 |
|---|---|---|
| `gitea-values.yaml` | Gitea (helm release `gitea`, ns infra) | `helm upgrade gitea gitea-charts/gitea --version 12.7.0 -n infra -f k8s/gitea-values.yaml` |
| `argocd-values.yaml` | ArgoCD (helm release `argocd`, ns argocd) | `helm upgrade argocd argo/argo-cd --version 10.17.2 -n argocd -f k8s/argocd-values.yaml` |
| `argocd-httproute.yaml` | ArgoCD 웹 UI 라우트 https://gpu.example.ac.kr/argocd (HTTPRoute infra/argocd + ReferenceGrant) | `kubectl apply -f k8s/argocd-httproute.yaml` |
| `argocd-default-project.yaml` | ArgoCD `default` AppProject 잠금 (모든 저장소·대상·리소스 거부) | `kubectl apply -f k8s/argocd-default-project.yaml` |
| `jenkins-values.yaml` | Jenkins CI (helm release `jenkins`, ns jenkins, ClusterIP, /jenkins). Job 은 JCasC 로 정의 | `helm upgrade --install jenkins jenkins/jenkins -n jenkins --create-namespace --version 5.13.3 -f k8s/jenkins-values.yaml` |
| `jenkins-teams.yaml` | Jenkins 팀별 빌드 네임스페이스 jenkins-infra/rag/vkey + launcher SA·Role | `kubectl apply -f k8s/jenkins-teams.yaml` |
| `jenkins-httproute.yaml` | Jenkins 웹 UI https://gpu.example.ac.kr/jenkins (HTTPRoute infra/jenkins + ReferenceGrant) | `kubectl apply -f k8s/jenkins-httproute.yaml` |
| `jenkins-token-rotation.yaml` | 팀 cloud 접속 토큰 매월 자동 갱신 CronJob (jenkins/launcher-token-rotation) | `kubectl apply -f k8s/jenkins-token-rotation.yaml` |
| `infra-gateway.yaml` | Gateway `infra-gateway` | `kubectl apply -f` |
| `gitea-httproute.yaml`, `http-to-https-redirect.yaml` | Gitea·HTTP 리다이렉트 라우트 | `kubectl apply -f` |
| `dcgm-servicemonitor.yaml` | GPU 메트릭 ServiceMonitor | `kubectl apply -f` |
| `vkey/` | vkey-postgres·pgadmin (초기 생성용 참고) | `kubectl apply -f` |

비밀값은 커밋하지 않는다. (`gitea-values.yaml` 의 관리자 비밀번호 등은 교체 후 제거 예정)
