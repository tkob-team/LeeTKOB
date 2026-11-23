FROM gcc:14.3.0@sha256:4e2d22617a3b4af1ad0150ba6ca3cb8a975c44c1abac6f9a09870b93cb5c363b

COPY supervise.py /usr/local/lib/leetkob/supervise.py
WORKDIR /work
USER 65534:65534
ENTRYPOINT ["/usr/bin/python3", "-I", "/usr/local/lib/leetkob/supervise.py"]
