pipeline {
    agent any

    triggers {
        pollSCM('H/1 * * * *')
    }

    environment {
        REGISTRY     = 'code-control:5000'
        REGISTRY_NS  = 'routine-planner'
        IMAGE        = "${REGISTRY}/${REGISTRY_NS}:latest"
        IMAGE_BUILD  = "${REGISTRY}/${REGISTRY_NS}:build-${BUILD_NUMBER}"
        DEPLOY_HOST  = 'routine-planner'
        DEPLOY_USER  = 'ubuntu'
        CONTAINER    = 'routine-planner'
        DATA_VOLUME  = 'routine-planner-data'
        HOST_PORT    = '8080'
        CONTAINER_PORT = '3000'
        HEALTH_URL   = "http://${DEPLOY_HOST}:${HOST_PORT}/api/health"
    }

    stages {
        stage('Checkout') {
            steps {
                sshagent(['github-deploy-key']) {
                    checkout scm
                }
            }
        }

        // Runs in a node:22-alpine container to match the Dockerfile's build
        // stage, so the agent host needs no Node toolchain. better-sqlite3
        // compiles from source unless a prebuilt binary matches, hence the
        // build toolchain in the container.
        stage('Typecheck & Test') {
            steps {
                sh '''
                    docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c '
                        set -e
                        apk add --no-cache python3 make g++ >/dev/null
                        npm ci
                        npm run typecheck
                        npm run test --workspaces --if-present -- --reporter=default --reporter=junit --outputFile.junit=test-results.xml
                    '
                '''
            }
            post {
                always {
                    junit testResults: '**/test-results.xml', allowEmptyResults: true
                }
            }
        }

        stage('Build image') {
            steps {
                sh '''
                    docker build \
                        -t "${IMAGE}" \
                        -t "${IMAGE_BUILD}" \
                        .
                '''
            }
        }

        stage('Push image') {
            steps {
                sh '''
                    docker push "${IMAGE}"
                    docker push "${IMAGE_BUILD}"
                '''
            }
        }

        stage('Deploy') {
            steps {
                sshagent(['routine-planner-ssh-key']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no \
                            -o UserKnownHostsFile=/dev/null \
                            -o LogLevel=ERROR \
                            "${DEPLOY_USER}@${DEPLOY_HOST}" \
                            "IMAGE='${IMAGE}' \
                             IMAGE_BUILD='${IMAGE_BUILD}' \
                             CONTAINER='${CONTAINER}' \
                             DATA_VOLUME='${DATA_VOLUME}' \
                             HOST_PORT='${HOST_PORT}' \
                             CONTAINER_PORT='${CONTAINER_PORT}' \
                             bash -s" <<'REMOTE'
                        set -euo pipefail

                        # Capture the running image before replacing it, so a
                        # failed health check can be rolled back.
                        PREV_IMAGE="$(docker inspect --format '{{.Image}}' "${CONTAINER}" 2>/dev/null || true)"
                        if [ -n "${PREV_IMAGE}" ]; then
                            echo "Currently running: ${PREV_IMAGE}"
                        else
                            echo "No running container; this is a first deploy"
                        fi

                        run_container() {
                            docker run -d --name "${CONTAINER}" \
                                --restart unless-stopped \
                                -p "${HOST_PORT}:${CONTAINER_PORT}" \
                                -e PORT="${CONTAINER_PORT}" \
                                -e DATA_DIR=/data \
                                -v "${DATA_VOLUME}:/data" \
                                "$1"
                        }

                        docker pull "${IMAGE_BUILD}"
                        docker rm -f "${CONTAINER}" 2>/dev/null || true
                        run_container "${IMAGE_BUILD}"

                        healthy=0
                        for i in $(seq 1 30); do
                            if curl -fsS "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null 2>&1; then
                                echo "Health check passed on attempt ${i}"
                                healthy=1
                                break
                            fi
                            sleep 2
                        done

                        if [ "${healthy}" -ne 1 ]; then
                            echo "ERROR: /api/health never returned 200 after 60s"
                            docker logs --tail 200 "${CONTAINER}" || true
                            if [ -n "${PREV_IMAGE}" ]; then
                                echo "Rolling back to ${PREV_IMAGE}"
                                docker rm -f "${CONTAINER}" || true
                                run_container "${PREV_IMAGE}"
                            else
                                echo "No previous image; leaving the failed container in place for inspection"
                            fi
                            exit 1
                        fi

                        echo "Deployed ${IMAGE_BUILD}"
                        REMOTE
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "Routine Planner ${env.IMAGE_BUILD} deployed to ${env.HEALTH_URL}"
        }
        failure {
            echo "Routine Planner pipeline failed (build ${env.BUILD_NUMBER})"
        }
    }
}
