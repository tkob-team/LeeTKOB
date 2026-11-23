#include <cstdio>

int a[1005];

int main() {
    int n;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    int distinct = 0;
    for (int i = 0; i < n; i++) {
        bool seen = false;
        for (int j = 0; j < i && !seen; j++) seen = (a[j] == a[i]);
        if (!seen) distinct++;
    }
    printf("%d\n", distinct);
    return 0;
}
