#include <bits/stdc++.h>
using namespace std;
#define REP(i, n) for (int i = 0; i < (int)(n); ++i)

int main() {
    string s;
    cin >> s;
    int sum = 0;
    REP(i, s.size()) sum += s[i] - '0';
    cout << sum << "\n";
    return 0;
}
