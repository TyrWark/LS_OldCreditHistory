(function () {
	'use strict';

	const getAccountId = () => window.merchantos?.account?.id;
	const getCustomerId = () => new URL(window.location.href).searchParams.get('id');
	const getCreditAccountId = () => window.customerCreditInfo?.creditAccoutnID ?? window.customerCreditInfo?.creditAccountID;
	const getCreditAccountRef = () => {
		const raw = getCreditAccountId();
		if (!raw) return null;
		const str = String(raw);
		return str.startsWith('ls-retail_') ? str : `ls-retail_${str}`;
	};
	const extractSaleId = (transactionRef) => {
		if (!transactionRef) return null;
		const parts = String(transactionRef).split('_');
		const last = parts[parts.length - 1];
		return /^\d+$/.test(last) ? last : null;
	};

	const addTableToggle = (table, limit = 15) => {
		const rows = Array.from(table.querySelectorAll('tr')).slice(1); // skip header
		if (rows.length <= limit) return null;
		const hidden = rows.slice(limit);
		hidden.forEach((tr) => {
			tr.style.display = 'none';
		});
		let expanded = false;
		const toggle = document.createElement('button');
		const updateLabel = () => {
			toggle.textContent = expanded ? `Show first ${limit}` : `Show all (${rows.length})`;
		};
		toggle.addEventListener('click', () => {
			expanded = !expanded;
			hidden.forEach((tr) => {
				tr.style.display = expanded ? '' : 'none';
			});
			updateLabel();
		});
		updateLabel();
		return toggle;
	};

	const buildCustomerUrl = () => {
		const customerId = getCustomerId();
		const accountId = getAccountId();
		if (!accountId) throw new Error('Missing account id');
		return `https://us.merchantos.com/API/Account/${accountId}/Customer/${customerId}.json?load_relations=all`;
	};

	const fetchCustomer = async () => {
		const url = buildCustomerUrl();
		try {
			const response = await fetch(url, { credentials: 'include' });
			if (!response.ok) throw new Error(`Request failed: ${response.status}`);
			const data = await response.json();
			window.latestCustomerData = data;
			const credit = data?.Customer?.CreditAccount || {};
			window.customerCreditInfo = {
				creditLimit: credit.creditLimit ?? null,
				creditAccoutnID: credit.creditAccoutnID ?? credit.creditAccountID ?? null,
				balance: credit.balance ?? null,
			};
			console.log('Fetched customer data:', data);
			console.log('Customer credit info:', window.customerCreditInfo);
			ensureCreditTab();
			showCreditTab();
		} catch (error) {
			console.error('Failed to fetch customer data', error);
		}
	};

	const clearAllTabDisplays = () => {
		document.querySelectorAll('.tabs article.tab').forEach((article) => {
			article.style.removeProperty('display');
		});
	};

	const employeeNameCache = new Map();
	const employeeFetches = new Map();

	const fetchEmployeeName = async (employeeId) => {
		const accountId = getAccountId();
		if (!accountId || !employeeId) throw new Error('Missing account or employee id');
		const url = `https://us.merchantos.com/API/V3/Account/${accountId}/Employee/${employeeId}.json`;
		const response = await fetch(url, {
			method: 'GET',
			credentials: 'include',
			headers: { Accept: 'application/json' },
		});
		if (!response.ok) throw new Error(`Emp fetch failed: ${response.status}`);
		const data = await response.json();
		const emp = data?.Employee;
		const name = [emp?.firstName, emp?.lastName].filter(Boolean).join(' ').trim();
		return name || String(employeeId);
	};

	const resolveEmployeeName = (employeeId, td) => {
		if (!employeeId) {
			td.textContent = '';
			return;
		}
		const accountId = getAccountId();
		const cacheKey = `${accountId || 'na'}:${employeeId}`;
		if (employeeNameCache.has(cacheKey)) {
			td.textContent = employeeNameCache.get(cacheKey);
			return;
		}
		td.textContent = 'Loading...';
		let promise = employeeFetches.get(cacheKey);
		if (!promise) {
			promise = fetchEmployeeName(employeeId)
				.then((name) => {
					employeeNameCache.set(cacheKey, name);
					return name;
				})
				.catch((err) => {
					console.error('Failed to fetch employee', employeeId, err);
					return String(employeeId);
				});
			employeeFetches.set(cacheKey, promise);
		}
		promise.then((name) => {
			td.textContent = name;
		});
	};

	let creditActivityLoading = false;

	const renderCreditActivity = (payments) => {
		const container = document.getElementById('oldCreditsContent');
		if (!container) return;
		container.innerHTML = '';
		if (!payments || !payments.length) {
			container.textContent = 'No withdrawal payments found.';
			return;
		}

		const computeRunningTotals = (rows) => {
			const isArchived = (row) => String(row?.archived).toLowerCase() === 'true';
			let runningTotal = 0;
			return rows.map((row) => {
				const archived = isArchived(row);
				const amountNum = Number.parseFloat(row?.amount) || 0;
				const previous = runningTotal;
				let depositPortion = 0;
				let creditPortion = 0;
				let spendSource = '';

				if (!archived && amountNum > 0) {
					const availableDeposit = Math.max(0, -previous);
					depositPortion = Math.min(amountNum, availableDeposit);
					creditPortion = amountNum - depositPortion;

					if (depositPortion > 0 && creditPortion > 0) {
						spendSource = 'mixed';
					} else if (creditPortion > 0) {
						spendSource = 'credit-limit';
					} else if (depositPortion > 0) {
						spendSource = 'account-deposit';
					}
				}

				if (!archived) {
					runningTotal = previous + amountNum;
				}

				return {
					...row,
					_previous: previous,
					_runningTotal: runningTotal,
					_depositPortion: !archived && amountNum > 0 ? depositPortion : '',
					_creditPortion: !archived && amountNum > 0 ? creditPortion : '',
					_spendSource: !archived && amountNum > 0 ? spendSource : '',
				};
			});
		};

		const paymentsWithTotals = computeRunningTotals(payments);

		const formatMoney = (val) => {
			const num = Number.parseFloat(val);
			if (Number.isNaN(num)) return val ?? '';
			return `$${num.toFixed(2)}`;
		};

		const formatMoneyCents = (val) => {
			const num = Number.parseFloat(val);
			if (Number.isNaN(num)) return val ?? '';
			return `$${(num / 100).toFixed(2)}`;
		};

		const formatDateTime = (val) => {
			if (!val) return '';
			const d = new Date(val);
			if (Number.isNaN(d.getTime())) return val;
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			const dd = String(d.getDate()).padStart(2, '0');
			const yyyy = d.getFullYear();
			const hh = String(d.getHours()).padStart(2, '0');
			const min = String(d.getMinutes()).padStart(2, '0');
			return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
		};

		const table = document.createElement('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'salePaymentID', label: 'LSPAY', render: (val, row, td) => {
				const displayId = val ?? '';
				if (!displayId) return;
				const paymentId = row?.paymentID || displayId;
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/reports/payment/retail/${paymentId}`;
				link.textContent = String(displayId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			}},
			{ key: 'salePaymentID', label: 'Non LSPAY', render: (val, row, td) => {
				const displayId = val ?? '';
				if (!displayId) return;
				const paymentId = row?.paymentID || displayId;
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=reports.register.views.payment&form_name=view&id=${paymentId}&tab=details`;
				link.textContent = String(displayId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			}},
			{ key: 'amount', label: 'amount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: '_previous', label: 'previous', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: '_runningTotal', label: 'runningTotal', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: '_spendSource', label: 'spendSource' },
			{ key: '_depositPortion', label: 'depositPortion', render: (val, _row, td) => { td.textContent = val === '' ? '' : formatMoney(val); } },
			{ key: '_creditPortion', label: 'creditPortion', render: (val, _row, td) => { td.textContent = val === '' ? '' : formatMoney(val); } },
			{ key: 'tipAmount', label: 'tipAmount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: 'surchargeAmount', label: 'surchargeAmount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: 'createTime', label: 'createTime', render: (val, _row, td) => { td.textContent = formatDateTime(val); } },
			{ key: 'archived', label: 'archived' },
			{ key: 'saleID', label: 'saleID', render: (val, _row, td) => {
				const saleId = val ?? '';
				if (!saleId) return;
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				link.textContent = String(saleId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			}},
			{ key: 'paymentTypeID', label: 'paymentTypeID' },
			{ key: 'registerID', label: 'registerID' },
			{ key: 'employeeID', label: 'employee', render: (val, _row, td) => { resolveEmployeeName(val, td); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			th.style.border = '1px solid #ccc';
			th.style.padding = '4px 6px';
			th.style.textAlign = 'left';
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		paymentsWithTotals.forEach((p) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = p?.[key];
				if (render) {
					render(raw, p, td);
				} else {
					td.textContent = raw ?? '';
				}
				td.style.border = '1px solid #eee';
				td.style.padding = '4px 6px';
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		container.appendChild(table);

		const toggle = addTableToggle(table, 15);
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			container.appendChild(toggleWrap);
		}

		const toNumber = (val) => {
			const num = Number.parseFloat(val);
			return Number.isNaN(num) ? 0 : num;
		};
		const totals = payments.reduce(
			(acc, p) => {
				const archived = String(p?.archived).toLowerCase() === 'true';
				if (archived) return acc;
				acc.amount += toNumber(p?.amount);
				acc.tipAmount += toNumber(p?.tipAmount);
				acc.surchargeAmount += toNumber(p?.surchargeAmount);
				return acc;
			},
			{ amount: 0, tipAmount: 0, surchargeAmount: 0 }
		);

		const totalsDiv = document.createElement('div');
		totalsDiv.style.marginTop = '8px';
		totalsDiv.textContent = `Totals — Amount: ${formatMoney(totals.amount)}, Tips: ${formatMoney(totals.tipAmount)}, Surcharge: ${formatMoney(totals.surchargeAmount)}`;
		container.appendChild(totalsDiv);

		const creditInfo = window.customerCreditInfo || {};
		const creditLimitNum = toNumber(creditInfo.creditLimit);
		const onDepositNum = toNumber(creditInfo.balance);
		const availableNum = creditLimitNum - onDepositNum;

		const detailsDiv = document.createElement('div');
		detailsDiv.style.marginTop = '6px';
		detailsDiv.innerHTML = `<strong>Credit Account Details</strong><br>Credit Limit: ${formatMoney(creditLimitNum)}<br>On Deposit: ${formatMoney(onDepositNum)}<br>Available: ${Number.isNaN(availableNum) ? '' : formatMoney(availableNum)}`;
		container.appendChild(detailsDiv);


		const invoicesDiv = document.createElement('div');
		invoicesDiv.id = 'oldCreditsInvoices';
		invoicesDiv.style.marginTop = '10px';
		invoicesDiv.textContent = 'Loading invoices...';
		container.appendChild(invoicesDiv);
		fetchInvoices(invoicesDiv, formatMoneyCents, formatDateTime);

		const memosDiv = document.createElement('div');
		memosDiv.id = 'oldCreditsCreditMemos';
		memosDiv.style.marginTop = '10px';
		memosDiv.textContent = 'Loading credit memos...';
		container.appendChild(memosDiv);
		fetchCreditMemos(memosDiv, formatMoneyCents, formatDateTime);

		const accountSummaryDiv = document.createElement('div');
		accountSummaryDiv.id = 'oldCreditsCustomerAccount';
		accountSummaryDiv.style.marginTop = '10px';
		accountSummaryDiv.textContent = 'Loading customer account summary...';
		container.appendChild(accountSummaryDiv);
		fetchCustomerAccountSummary(accountSummaryDiv, formatMoney);

		const paymentRequestsDiv = document.createElement('div');
		paymentRequestsDiv.id = 'oldCreditsPaymentRequests';
		paymentRequestsDiv.style.marginTop = '10px';
		paymentRequestsDiv.textContent = 'Loading payment requests...';
		container.appendChild(paymentRequestsDiv);
		fetchPaymentRequests(paymentRequestsDiv, formatMoneyCents, formatDateTime);
	};

	const fetchInvoices = async (targetDiv, moneyFormatter, dateFormatter) => {
		const creditAccountRef = getCreditAccountRef();
		if (!creditAccountRef) {
			targetDiv.textContent = 'Invoices unavailable (missing credit account id).';
			return;
		}

		targetDiv.textContent = 'Loading invoices...';
		const url = `https://us.merchantos.com/admin/invoicing/v1/credit-accounts/${encodeURIComponent(creditAccountRef)}/invoices?page=1&limit=20&sort=createdAt:desc`;

		try {
			const response = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
			if (!response.ok) throw new Error(`Invoices request failed: ${response.status}`);
			const data = await response.json();
			const invoices = Array.isArray(data?.data) ? data.data : [];
			renderInvoices(targetDiv, invoices, moneyFormatter, dateFormatter);
		} catch (err) {
			console.error('Failed to fetch invoices', err);
			targetDiv.textContent = `Failed to load invoices: ${err.message}`;
		}
	};

	const fetchCreditMemos = async (targetDiv, moneyFormatter, dateFormatter) => {
		const creditAccountRef = getCreditAccountRef();
		if (!creditAccountRef) {
			targetDiv.textContent = 'Credit memos unavailable (missing credit account id).';
			return;
		}

		targetDiv.textContent = 'Loading credit memos...';
		const url = `https://us.merchantos.com/admin/invoicing/v1/credit-accounts/${encodeURIComponent(creditAccountRef)}/credit-memos?page=1&limit=20`;

		try {
			const response = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
			if (!response.ok) throw new Error(`Credit memos request failed: ${response.status}`);
			const data = await response.json();
			const memos = Array.isArray(data?.data) ? data.data : [];
			renderCreditMemos(targetDiv, memos, moneyFormatter, dateFormatter);
		} catch (err) {
			console.error('Failed to fetch credit memos', err);
			targetDiv.textContent = `Failed to load credit memos: ${err.message}`;
		}
	};

	const fetchPaymentRequests = async (targetDiv, moneyFormatter, dateFormatter) => {
		const customerRef = getCustomerId();
		if (!customerRef) {
			targetDiv.textContent = 'Payment requests unavailable (missing customer id).';
			return;
		}

		targetDiv.textContent = 'Loading payment requests...';
		const url = `https://us.merchantos.com/admin/invoicing/payment-requests?customerRef=${encodeURIComponent(customerRef)}`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				credentials: 'include',
				headers: { Accept: 'application/json' },
			});
			if (!response.ok) throw new Error(`Payment requests failed: ${response.status}`);
			const data = await response.json();
			const requests = Array.isArray(data?.data) ? data.data : [];
			renderPaymentRequests(targetDiv, requests, moneyFormatter, dateFormatter);
		} catch (err) {
			console.error('Failed to fetch payment requests', err);
			targetDiv.textContent = `Failed to load payment requests: ${err.message}`;
		}
	};

	const fetchCustomerAccountSummary = async (targetDiv, moneyFormatter) => {
		const creditAccountId = getCreditAccountId();
		if (!creditAccountId) {
			targetDiv.textContent = 'Customer account summary unavailable (missing credit account id).';
			return;
		}

		const creditLimitParam = window.customerCreditInfo?.creditLimit ?? '';
		targetDiv.textContent = 'Loading customer account summary...';
		const url = `https://us.merchantos.com/admin/invoicing/ls-customer-accounts/${encodeURIComponent(creditAccountId)}?credit_limit=${encodeURIComponent(creditLimitParam)}`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				credentials: 'include',
				headers: { Accept: 'application/json' },
			});
			if (!response.ok) throw new Error(`Customer account request failed: ${response.status}`);
			const data = await response.json();
			const attr = data?.attributes || {};
			targetDiv.innerHTML = '<strong>Customer Account Summary</strong>';
			const lines = [
				`Credit Limit: ${moneyFormatter(attr.creditLimit)}`,
				`Available From Credit Limit: ${moneyFormatter(attr.availableAmountFromCreditLimit)}`,
				`Deposit Balance: ${moneyFormatter(attr.depositBalance)}`,
				`Owing Balance: ${moneyFormatter(attr.owingBalance)}`,
				`Overdue Balance: ${moneyFormatter(attr.overdueBalance)}`,
				attr.currency ? `Currency: ${attr.currency}` : '',
			].filter(Boolean);
			const list = document.createElement('ul');
			lines.forEach((line) => {
				const li = document.createElement('li');
				li.textContent = line;
				list.appendChild(li);
			});
			targetDiv.appendChild(list);
		} catch (err) {
			console.error('Failed to fetch customer account summary', err);
			targetDiv.textContent = `Failed to load customer account summary: ${err.message}`;
		}
	};

	const renderInvoices = (targetDiv, invoices, moneyFormatter, dateFormatter) => {
		targetDiv.innerHTML = '<strong>Invoices</strong>';
		if (!invoices.length) {
			targetDiv.innerHTML += '<div>No invoices found.</div>';
			return;
		}

		const table = document.createElement('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'invoiceNumber', label: 'Invoice #' },
			{ key: 'transactionRef', label: 'Transaction Ref', render: (val, _row, td) => {
				const saleId = extractSaleId(val);
				if (!saleId) {
					td.textContent = val ?? '';
					return;
				}
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				link.textContent = val;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			} },
			{ key: 'total', label: 'Total', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'status', label: 'Status' },
			{ key: 'issueDate', label: 'Issue Date', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
			{ key: 'terms', label: 'Terms', render: (val, row, td) => {
				const terms = val || row?.terms;
				if (!terms) return;
				const parts = [];
				if (terms.dueDate) parts.push(`Due: ${dateFormatter(terms.dueDate)}`);
				if (terms.customerEmail) parts.push(`Email: ${terms.customerEmail}`);
				if (typeof terms.sendByEmail === 'boolean') parts.push(`Send by email: ${terms.sendByEmail}`);
				td.textContent = parts.join(' | ');
			} },
			{ key: 'proposalURL', label: 'Proposal', render: (val, _row, td) => {
				if (!val) return;
				const link = document.createElement('a');
				link.href = val;
				link.textContent = 'Open';
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			} },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			th.style.border = '1px solid #ccc';
			th.style.padding = '4px 6px';
			th.style.textAlign = 'left';
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		invoices.forEach((inv) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = inv?.[key];
				if (render) {
					render(raw, inv, td);
				} else {
					td.textContent = raw ?? '';
				}
				td.style.border = '1px solid #eee';
				td.style.padding = '4px 6px';
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 15);
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const renderCreditMemos = (targetDiv, memos, moneyFormatter, dateFormatter) => {
		targetDiv.innerHTML = '<strong>Credit Memos</strong>';
		if (!memos.length) {
			targetDiv.innerHTML += '<div>No credit memos found.</div>';
			return;
		}

		const table = document.createElement('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'creditMemoNumber', label: 'Credit Memo #' },
			{ key: 'type', label: 'Type' },
			{ key: 'amount', label: 'Amount', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'remainingAmount', label: 'Remaining', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'status', label: 'Status' },
			{ key: 'transactionRef', label: 'Transaction Ref', render: (val, _row, td) => {
				const saleId = extractSaleId(val);
				if (!saleId) {
					td.textContent = val ?? '';
					return;
				}
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				link.textContent = val;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			} },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			th.style.border = '1px solid #ccc';
			th.style.padding = '4px 6px';
			th.style.textAlign = 'left';
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		memos.forEach((memo) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = memo?.[key];
				if (render) {
					render(raw, memo, td);
				} else {
					td.textContent = raw ?? '';
				}
				td.style.border = '1px solid #eee';
				td.style.padding = '4px 6px';
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 15);
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const renderPaymentRequests = (targetDiv, requests, moneyFormatter, dateFormatter) => {
		targetDiv.innerHTML = '<strong>Payment Requests</strong>';
		if (!requests.length) {
			targetDiv.innerHTML += '<div>No payment requests found.</div>';
			return;
		}

		const formatDiscounts = (discounts) => {
			if (!Array.isArray(discounts) || !discounts.length) return '';
			return discounts
				.map((d) => {
					const percent = typeof d?.percent === 'number' ? `${(d.percent * 100).toFixed(0)}%` : '';
					const amount = typeof d?.totalAmount === 'number' ? moneyFormatter(d.totalAmount) : '';
					const label = d?.name || d?.type || 'Discount';
					return [label, percent, amount && `(${amount})`].filter(Boolean).join(' ');
				})
				.join('; ');
		};

		const formatFees = (fees) => {
			if (!Array.isArray(fees) || !fees.length) return '';
			return fees
				.map((f) => {
					const amount = typeof f?.totalAmount === 'number' ? moneyFormatter(f.totalAmount) : '';
					const label = f?.name || f?.type || 'Fee';
					return [label, amount].filter(Boolean).join(' ');
				})
				.join('; ');
		};

		const table = document.createElement('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'status', label: 'Status' },
			{ key: 'requestedAmount', label: 'Requested', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'currency', label: 'Currency' },
			{ key: 'location', label: 'Location', render: (_val, row, td) => {
				const loc = row?.location || {};
				const parts = [loc.name, loc.email].filter(Boolean).join(' | ');
				td.textContent = parts;
			} },
			{ key: 'customer', label: 'Customer', render: (_val, row, td) => {
				const cust = row?.customer || {};
				const name = [cust.firstName, cust.lastName].filter(Boolean).join(' ').trim();
				const extras = [cust.email, cust.customerRef ? `Ref ${cust.customerRef}` : '', cust.creditAccountRef ? `Credit ${cust.creditAccountRef}` : '']
					.filter(Boolean)
					.join(' | ');
				td.textContent = [name, extras].filter(Boolean).join(' — ');
			} },
			{ key: 'pricingTables', label: 'Items / Discounts / Fees', render: (_val, row, td) => {
				const pts = Array.isArray(row?.pricingTables) ? row.pricingTables : [];
				if (!pts.length) return;
				const list = document.createElement('ul');
				list.style.paddingLeft = '18px';
				list.style.margin = '0';
				pts.forEach((pt) => {
					const li = document.createElement('li');
					const summary = `${pt?.title || 'Pricing'}: Total ${moneyFormatter(pt?.totalAmount)} (Subtotal ${moneyFormatter(pt?.subtotal)}, Discounts ${moneyFormatter(pt?.discountTotal)}, Fees ${moneyFormatter(pt?.feeTotal)}, Tax ${moneyFormatter(pt?.taxTotal)})`;
					li.textContent = summary;
					const itemsList = document.createElement('ul');
					itemsList.style.paddingLeft = '16px';
					itemsList.style.margin = '4px 0 0 0';
					const lineItems = Array.isArray(pt?.lineItems) ? pt.lineItems : [];
					lineItems.forEach((item) => {
						const innerLi = document.createElement('li');
						const pieces = [];
						pieces.push(`${item?.quantity ?? 0} x ${item?.name || 'Item'}`);
						pieces.push(`@ ${moneyFormatter(item?.unitAmount)}`);
						pieces.push(`= ${moneyFormatter(item?.totalAmount)}`);
						const extras = [];
						const discounts = formatDiscounts(item?.discounts);
						if (discounts) extras.push(`Discounts: ${discounts}`);
						const fees = formatFees(item?.fees);
						if (fees) extras.push(`Fees: ${fees}`);
						if (extras.length) pieces.push(`(${extras.join(' | ')})`);
						innerLi.textContent = pieces.filter(Boolean).join(' ');
						itemsList.appendChild(innerLi);
					});
					const tableDiscounts = formatDiscounts(pt?.discounts);
					if (tableDiscounts) {
						const dLi = document.createElement('li');
						dLi.textContent = `Table Discounts: ${tableDiscounts}`;
						itemsList.appendChild(dLi);
					}
					const tableFees = formatFees(pt?.fees);
					if (tableFees) {
						const fLi = document.createElement('li');
						fLi.textContent = `Table Fees: ${tableFees}`;
						itemsList.appendChild(fLi);
					}
					if (itemsList.childElementCount) li.appendChild(itemsList);
					list.appendChild(li);
				});
				td.appendChild(list);
			} },
			{ key: 'payments', label: 'Payments', render: (_val, row, td) => {
				const payments = Array.isArray(row?.payments) ? row.payments : [];
				if (!payments.length) return;
				const list = document.createElement('ul');
				list.style.paddingLeft = '18px';
				list.style.margin = '0';
				payments.forEach((p) => {
					const li = document.createElement('li');
					const parts = [p?.status, moneyFormatter(p?.amount), p?.cardBrand ? `Card ${p.cardBrand}` : '', p?.last4 ? `••••${p.last4}` : '', p?.dateTaken ? dateFormatter(p.dateTaken) : '']
						.filter(Boolean)
						.join(' | ');
					li.textContent = parts;
					list.appendChild(li);
				});
				td.appendChild(list);
			} },
			{ key: 'documentRefs', label: 'Docs', render: (val, row, td) => {
				const docs = Array.isArray(val) ? val : [];
				const proposal = row?.proposalHash;
				const parts = [];
				if (docs.length) parts.push(`Refs: ${docs.join(', ')}`);
				if (proposal) parts.push(`Proposal: ${proposal}`);
				td.textContent = parts.join(' | ');
			} },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			th.style.border = '1px solid #ccc';
			th.style.padding = '4px 6px';
			th.style.textAlign = 'left';
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		requests.forEach((req) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = req?.[key];
				if (render) {
					render(raw, req, td);
				} else {
					td.textContent = raw ?? '';
				}
				td.style.border = '1px solid #eee';
				td.style.padding = '4px 6px';
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 10);
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const fetchCreditActivity = async () => {
		const creditAccountId = window.customerCreditInfo?.creditAccoutnID ?? window.customerCreditInfo?.creditAccountID;
		const accountId = getAccountId();
		if (!creditAccountId || !accountId) {
			console.warn('Missing credit account or account id for activity fetch');
			return;
		}

		if (creditActivityLoading) return;
		creditActivityLoading = true;

		const targetUrl = `https://us.merchantos.com/API/Account/${accountId}/CreditAccount/${creditAccountId}.json?load_relations=all`;
		const container = document.getElementById('oldCreditsContent');
		if (container) container.textContent = 'Loading credit activity...';

		try {
			const response = await fetch(targetUrl, {
				method: 'GET',
				credentials: 'include',
				headers: {
					Accept: 'application/json',
				},
			});

			if (!response.ok) throw new Error(`Activity request failed: ${response.status}`);
			const data = await response.json();
			const paymentsRaw = data?.CreditAccount?.WithdrawalPayments?.SalePayment;
			const payments = Array.isArray(paymentsRaw) ? paymentsRaw : paymentsRaw ? [paymentsRaw] : [];

			window.latestCreditActivity = { raw: data, payments };
			renderCreditActivity(payments);
		} catch (error) {
			console.error('Failed to fetch credit activity', error);
			if (container) container.textContent = `Failed to load credit activity: ${error.message}`;
		} finally {
			creditActivityLoading = false;
		}
	};

	const showCreditTab = () => {
		const tabsMenu = document.getElementById('tabsMenu');
		const tabsContainer = document.querySelector('.tabs');
		const creditArticle = document.getElementById('tab-oldcredits-article');
		if (!tabsMenu || !tabsContainer || !creditArticle) return;

		tabsMenu.querySelectorAll('li').forEach((li) => li.classList.remove('current'));
		const creditTabLi = document.getElementById('menuOldCredits')?.parentElement;
		if (creditTabLi) creditTabLi.classList.add('current');

		tabsContainer.querySelectorAll('article.tab').forEach((article) => {
			article.classList.add('inactive');
			article.style.removeProperty('display');
		});

		const creditContent = document.getElementById('oldCreditsContent');
		if (creditContent) {
			creditContent.textContent = 'Loading credit activity...';
		}

		creditArticle.classList.remove('inactive');
		creditArticle.style.removeProperty('display');
		fetchCreditActivity();
	};

	const ensureCreditTab = () => {
		const tabsMenu = document.getElementById('tabsMenu');
		const tabsContainer = document.querySelector('.tabs');
		if (!tabsMenu || !tabsContainer) return;

		if (!tabsMenu.dataset.tmCleanupAttached) {
			tabsMenu.addEventListener('click', (e) => {
				const anchor = e.target.closest('a');
				if (!anchor || anchor.id === 'menuOldCredits') return;
				clearAllTabDisplays();
			});
			tabsMenu.dataset.tmCleanupAttached = 'true';
		}

		if (!document.getElementById('menuOldCredits')) {
			const li = document.createElement('li');
			li.className = 'oldcredits';
			const anchor = document.createElement('a');
			anchor.id = 'menuOldCredits';
			anchor.href = '#oldcredits';
			anchor.textContent = 'Old Credits';
			anchor.addEventListener('click', (e) => {
				e.preventDefault();
				showCreditTab();
			});
			li.appendChild(anchor);
			tabsMenu.appendChild(li);
		}

		if (!document.getElementById('tab-oldcredits-article')) {
			const article = document.createElement('article');
			article.className = 'view_tab_oldcredits tab loaded inactive';
			article.id = 'tab-oldcredits-article';
			const content = document.createElement('div');
			content.className = 'content';
			content.id = 'tab_oldcredits';
			const div = document.createElement('div');
			div.id = 'oldCreditsContent';
			div.textContent = 'Loading credit activity...';
			content.appendChild(div);
			article.appendChild(content);
			tabsContainer.appendChild(article);
		}
	};

	const injectButton = () => {
		if (document.getElementById('tm-fetch-customer')) return;
		const button = document.createElement('button');
		button.id = 'tm-fetch-customer';
		button.textContent = 'Fetch Customer';
		Object.assign(button.style, {
			position: 'absolute',
			top: '12px',
			right: '12px',
			padding: '8px 12px',
			zIndex: '9999',
			cursor: 'pointer',
		});
		button.addEventListener('click', fetchCustomer);
		document.body.appendChild(button);
	};

	const init = () => {
		injectButton();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
