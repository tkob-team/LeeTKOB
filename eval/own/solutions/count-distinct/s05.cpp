#include <cstdio>
#include <algorithm>
#define DEDUP(p, n) (std::unique((p), (p) + (n)) - (p))

long long a[1005];

void insertionSort(long long* p, int n) {
    for (int i = 1; i < n; i++) {
        long long key = p[i];
        int j = i - 1;
        while (j >= 0 && p[j] > key) {
            p[j + 1] = p[j];
            j--;
        }
        p[j + 1] = key;
    }
}

int main() {
    int n;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%lld", &a[i]);
    insertionSort(a, n);
    printf("%d\n", (int)DEDUP(a, n));
    return 0;
}
