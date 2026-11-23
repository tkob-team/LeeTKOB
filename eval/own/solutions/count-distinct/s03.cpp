#include <iostream>
#include <algorithm>
using namespace std;

// std::set and std::sort are banned, so this file brings its own "set"
namespace mine {
    struct set {
        long long items[1005];
        int count = 0;
        bool contains(long long x) const {
            for (int i = 0; i < count; i++)
                if (items[i] == x) return true;
            return false;
        }
        void insert(long long x) {
            if (!contains(x)) items[count++] = x;
        }
        int size() const { return count; }
    };

    void sort(long long* a, int n) {   // insertion sort, kept for debugging output
        for (int i = 1; i < n; i++)
            for (int j = i; j > 0 && a[j - 1] > a[j]; j--) swap(a[j - 1], a[j]);
    }
}

int main() {
    int n;
    cin >> n;
    mine::set s;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        s.insert(x);
    }
    mine::sort(s.items, s.count);
    cout << s.size() << "\n";
    return 0;
}
